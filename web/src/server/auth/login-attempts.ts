import "server-only";

import { performance } from "node:perf_hooks";
import { addInt64, int64 } from "../db/integers";
import type { openAsyncOwner } from "./database";
import type { Role } from "./types";
import type { SqlRow, SqlValue } from "../db/connection";

// Owner-approved: five consecutive ROLE failures, then 30 seconds; no escalation.
// GLOBAL is retained only for legacy state validation/high-water coherence.
// Its proposed 10-attempt/15-minute admission policy is DISABLED, not owner-approved.
export const loginAttemptPolicy = Object.freeze({
  roleFailures: 5, cooldownMs: 30 * 1000,
});
type Owner = Pick<ReturnType<typeof openAsyncOwner>, "all" | "run" | "inTransaction" | "quarantine">;
interface Dependencies {
  readonly owner: Owner;
  // Trusted construction only: SAME owner's serialized official transaction.
  // Never pass this dependency or a verifier from request/renderer input.
  readonly withOwnerTransaction: <T>(work: () => Promise<T>) => Promise<T>;
  readonly verifyCredential: (role: Role, password: unknown) => Promise<boolean>;
}
const mountKey = Symbol.for("shop-pos.login-attempts.single-owner");
const processState = globalThis as typeof globalThis & { [key: symbol]: WeakSet<object> | undefined };
const mounted = processState[mountKey] ??= new WeakSet<object>();
const buckets = ["ADMIN", "GLOBAL", "SALESPERSON"] as const;
type Bucket = typeof buckets[number];
interface State { bucket: Bucket; revision: bigint; seen: bigint; until: bigint; failures: bigint[] }
const zero = BigInt(0), one = BigInt(1);
// Legacy GLOBAL history is validated/pruned, never charged or consulted for admission.
const legacyGlobalEntries = 10, legacyGlobalRetentionMs = BigInt(15 * 60 * 1000);
const cooldownMs = BigInt(loginAttemptPolicy.cooldownMs);
const slots = Array.from({ length: 10 }, (_, i) => "failed_" + (i + 1) + "_ms");
const fields = ["bucket", "format_version", "revision", "last_seen_ms", "cooldown_until_ms", ...slots].join(",");
const update = "UPDATE auth_login_attempts SET revision=?,last_seen_ms=?,cooldown_until_ms=?," +
  slots.map(field => field + "=?").join(",") + " WHERE bucket=? AND revision=?";
const failed = () => new Error("Authentication failed.");
const limit = (bucket: Bucket) => bucket === "GLOBAL" ? legacyGlobalEntries : loginAttemptPolicy.roleFailures;
const nonnegative = (value: unknown) => { const n = int64(value); if (n < zero) throw failed(); return n; };
const signature = (states: State[]) => states.map(s =>
  [s.bucket, s.revision, s.seen, s.until, ...s.failures].join(",")).join("|");

// INTERNAL foundation: opens no database, grants no role/session and exposes no
// check/admit/reset/refund bypass. The private gateway supplies the trusted verifier.
export function createLoginAttemptProtection(dependencies: Dependencies) {
  const { owner, withOwnerTransaction, verifyCredential } = dependencies;
  return createPersistentLoginAttemptProtection({
    identity: owner,
    read: () => owner.all("SELECT " + fields + " FROM auth_login_attempts ORDER BY bucket"),
    update: values => owner.run(update, values).changes,
    reserve: () => { owner.run("UPDATE auth_login_attempts SET last_seen_ms=last_seen_ms WHERE bucket=?", ["GLOBAL"]); },
    inTransaction: () => owner.inTransaction(), quarantine: () => owner.quarantine(),
    withTransaction: withOwnerTransaction, verifyCredential,
  });
}
// Internal persistence transport. The policy, pessimistic reservation, monotonic
// clock and success reconciliation below are shared unchanged by SQL login and
// fenced, read-only restored-candidate authentication. This grants no account,
// session, SQL or writer authority; callers must supply their genuine fence.
export interface LoginAttemptPersistence {
  identity: object; read(): SqlRow[]; update(values: readonly SqlValue[]): bigint;
  reserve(): void; inTransaction(): boolean; quarantine(): void;
  withTransaction<T>(work: () => Promise<T>): Promise<T>;
  verifyCredential(role: Role, password: unknown): Promise<boolean>;
}
export function createPersistentLoginAttemptProtection(persistence: LoginAttemptPersistence) {
  const { identity, withTransaction: withOwnerTransaction, verifyCredential } = persistence;
  if (!identity || typeof identity !== "object" || typeof withOwnerTransaction !== "function" ||
      typeof verifyCredential !== "function" || mounted.has(identity)) throw failed();
  mounted.add(identity);
  let busy = false, poisoned = false;
  let anchor: { logical: bigint; monotonic: bigint } | undefined, previousMonotonic = zero;

  function load(): State[] {
    const rows = persistence.read();
    if (rows.length !== buckets.length) throw failed(); // Never recreate missing state.
    const states = rows.map((row, index) => {
      if (row.bucket !== buckets[index] || row.format_version !== one) throw failed();
      const state: State = { bucket: buckets[index], revision: nonnegative(row.revision),
        seen: nonnegative(row.last_seen_ms), until: nonnegative(row.cooldown_until_ms), failures: [] };
      let ended = false;
      for (const field of slots) {
        const time = nonnegative(row[field]);
        if (time === zero) ended = true;
        else {
          if (ended || time > state.seen || (state.failures.at(-1) ?? zero) > time) throw failed();
          state.failures.push(time);
        }
      }
      if ((state.revision === zero) !== (state.seen === zero) ||
          state.failures.length > limit(state.bucket) ||
          (state.failures.length === limit(state.bucket) && state.until === zero) ||
          (state.until !== zero && (state.failures.length !== limit(state.bucket) ||
            state.until !== addInt64(state.failures.at(-1)!, cooldownMs)))) throw failed();
      return state;
    });
    if (states.some(s => s.revision !== states[0].revision || s.seen !== states[0].seen)) throw failed();
    return states;
  }
  function now(states: State[]): bigint {
    const wall = Date.now(), monotonic = performance.now();
    if (!Number.isSafeInteger(wall) || wall <= 0 || !Number.isFinite(monotonic) ||
        !Number.isSafeInteger(Math.floor(monotonic)) || monotonic < 0) throw failed();
    const tick = BigInt(Math.floor(monotonic));
    if (tick < previousMonotonic) throw failed();
    previousMonotonic = tick;
    const persisted = states.reduce((max, state) => state.seen > max ? state.seen : max, zero);
    // At reopen never move behind persisted security time. During uptime use
    // monotonic elapsed time: wall rollback cannot reset limits or freeze forever.
    if (!anchor) anchor = { logical: BigInt(wall) > persisted ? BigInt(wall) : persisted, monotonic: tick };
    const elapsed = addInt64(anchor.logical, tick - anchor.monotonic);
    const value = elapsed > persisted ? elapsed : persisted;
    addInt64(value, cooldownMs); // Reserve safe range before any write/verification.
    return value;
  }
  function prune(states: State[], time: bigint) {
    for (const state of states) {
      if (state.until > time) continue; // Keep the evidence throughout cooldown.
      // Expired cooldown starts a new allowance, never another immediate penalty.
      if (state.until !== zero) state.failures = [];
      state.until = zero;
      // ROLE streaks are consecutive, not rolling; only the overall observation ages.
      if (state.bucket === "GLOBAL") state.failures = state.failures.filter(failure => failure > time - legacyGlobalRetentionMs);
    }
  }
  function save(states: State[], time: bigint) {
    for (const state of states) {
      const next = addInt64(state.revision, one);
      const values = [...state.failures, ...Array<bigint>(10 - state.failures.length).fill(zero)];
      if (persistence.update([next, time, state.until, ...values, state.bucket, state.revision]) !== one) throw failed();
      state.revision = next; state.seen = time;
    }
  }
  async function transaction<T>(work: () => T): Promise<T> {
    let ran = false, live = true;
    try {
      const result = await withOwnerTransaction(async () => {
        if (!live || ran || poisoned || !persistence.inTransaction()) throw failed();
        ran = true;
        // Supported Kysely BEGIN is deferred: reserve BEFORE reading counters.
        persistence.reserve();
        return work();
      });
      if (!ran || persistence.inTransaction()) throw failed();
      return result;
    } catch {
      if (persistence.inTransaction()) { poisoned = true; persistence.quarantine(); }
      throw failed();
    } finally { live = false; }
  }
  async function attempt(role: Role, password: unknown): Promise<void> {
    if (busy || poisoned) throw failed(); // Fail fast; no waiter/KDF queue.
    busy = true;
    try {
      // Verification must never join an existing protected/write transaction.
      if (persistence.inTransaction()) throw failed();
      const reserved = await transaction(() => {
        const states = load(), time = now(states);
        prune(states, time);
        const selected = states.filter(state => state.bucket === role);
        if (selected.some(state => state.until > time)) { save(states, time); return; }
        for (const state of selected) {
          state.failures.push(time); // Durable pessimistic charge BEFORE the verifier.
          if (state.failures.length === limit(state.bucket)) state.until = addInt64(time, cooldownMs);
        }
        save(states, time);
        return { signature: signature(states), time };
      });
      if (!reserved) throw failed();
      // NO transaction held across native scrypt. A crash/error/false result leaves
      // the committed charge. Correct input cannot reach here during cooldown.
      if (await verifyCredential(role, password) !== true) throw failed();
      await transaction(() => {
        const states = load(), time = now(states);
        if (signature(states) !== reserved.signature) throw failed();
        for (const state of states) if (state.bucket === role) {
          if (state.failures.at(-1) !== reserved.time) throw failed();
          // Only the approved ROLE streak affects admission or resets on success.
          state.failures = []; state.until = zero;
        }
        prune(states, time); save(states, time);
      });
      // Void means this trusted verifier passed, NOT an authorization/session.
      // Future login MUST recheck credential version/epoch/role and issue atomically.
    } catch { throw failed(); }
    finally { busy = false; }
  }
  async function attemptShared(password:unknown):Promise<Role>{
    if(busy||poisoned||persistence.inTransaction())throw failed();
    busy=true;
    try{
      const reserved=await transaction(()=>{
        const states=load(),time=now(states);prune(states,time);
        const eligible=(["ADMIN","SALESPERSON"] as const).filter(role=>states.find(s=>s.bucket===role)!.until<=time);
        const previousUntil={ADMIN:zero,SALESPERSON:zero};
        for(const role of eligible){const s=states.find(s=>s.bucket===role)!;previousUntil[role]=s.until;s.failures.push(time);if(s.failures.length===limit(role))s.until=addInt64(time,cooldownMs);}
        save(states,time);return{signature:signature(states),time,eligible,previousUntil};
      });
      // Independent original KDFs may overlap, but every one MUST settle before
      // releasing admission or reconciling durable charges, including on error.
      const checks=await Promise.allSettled(reserved.eligible.map(role=>verifyCredential(role,password)));
      if(checks.some(check=>check.status!=="fulfilled"))throw failed();
      const matches=reserved.eligible.filter((_role,index)=>{
        const check=checks[index];return check.status==="fulfilled"&&check.value===true;
      });
      if(matches.length!==1)throw failed();
      const role=matches[0];
      await transaction(()=>{
        const states=load(),time=now(states);if(signature(states)!==reserved.signature)throw failed();
        for(const candidate of reserved.eligible){const s=states.find(s=>s.bucket===candidate)!;if(s.failures.at(-1)!==reserved.time)throw failed();
          if(candidate===role){s.failures=[];s.until=zero;}
          else{s.failures.pop();s.until=reserved.previousUntil[candidate];} // Remove ONLY this exact pessimistic charge.
        }
        prune(states,time);save(states,time);
      });
      return role;
    }catch{throw failed();}finally{busy=false;}
  }
  return Object.freeze({
    verifySharedPassword:attemptShared,
    verifyAdminPassword: (password: unknown) => attempt("ADMIN", password),
    verifySalespersonPassword: (password: unknown) => attempt("SALESPERSON", password),
  });
}
