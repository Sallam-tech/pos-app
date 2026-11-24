import {channel} from "node:diagnostics_channel";
import { assertProtectedWriterAdmission } from "../bootstrap/writer-admission";
import {assertAccountSettingsLedgers,assertSettingsLedgers,currentSettings,settingsContext} from "../settings/model";
import {uuid,object,text} from "../inventory/validation";
import type {PasswordOperationKey} from "./types";
import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { betterAuth } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { deleteSessionCookie, setSessionCookie } from "better-auth/cookies";
import { getCurrentAdapter, runWithTransaction } from "@better-auth/core/context";
import { openAsyncOwner } from "./database";
import { assertRuntimeOwnership } from "../hosting/ownership";
import { withHeldBootstrapOwnership, hasActiveBootstrapLease, type BootstrapLease } from "../bootstrap/ownership";
import { resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import { createVolatileStorage } from "./storage";
import { assertPasswordNotReused, passwordCallbacks, passwordPolicy } from "./password";
import { createLoginAttemptProtection } from "./login-attempts";
import { assertOfflinePassword } from "./offline-password";
import { clearReviewedSchemaAdmission, validateReviewedSchema } from "../db/validate-schema";
import { int64 } from "../db/integers";
import { AuthorizationDenied, type Actor, type AuthorizationConfiguration, type AuthorizationGateway, type AuthorizedTransaction, type Role, type VerifiedCredential } from "./types";

const ownerKey = Symbol.for("shop-pos.authorization.single-process-owner");
const receiptLifetimeMs = 5000;
const rotationOperationLifetimeMs = 30000; // Part3M owner-approved execution bound; not proof/session lifetime.
const processState = globalThis as typeof globalThis & { [key: symbol]: boolean | undefined };
const roles = ["ADMIN", "SALESPERSON"] as const;
const deny = (): never => { throw new AuthorizationDenied(); };
type ReadHook=<T>(role:Role,request:Request,work:(tx:AuthorizedTransaction,actor:Actor)=>Promise<T>)=>Promise<T>;
type SharedCredential=Readonly<{role:Role;receipt:VerifiedCredential}>;
const sharedCredentialReaders=new WeakMap<object,(password:unknown)=>Promise<SharedCredential>>();
export function verifySharedPassword(gateway:AuthorizationGateway,password:unknown):Promise<SharedCredential>{
 const access=sharedCredentialReaders.get(gateway);if(!access)return Promise.reject(new AuthorizationDenied());return access(password);
}
const dependencyReaders=new WeakMap<object,ReadHook>();
// Only the real gateway registers this read-only path; structural gateways fail closed.
export function withDependencyRead<T>(gateway:AuthorizationGateway,role:Role,request:Request,work:(tx:AuthorizedTransaction,actor:Actor)=>Promise<T>):Promise<T>{const read=dependencyReaders.get(gateway);if(!read)return Promise.reject(new AuthorizationDenied());return read(role,request,work);}
// Preserve existing HTTP cancellation fences when wrapping a genuine gateway.
export function bindDependencyReads(source:AuthorizationGateway,target:AuthorizationGateway,live:()=>void):void{const read=dependencyReaders.get(source);if(!read)return;dependencyReaders.set(target,async(role,request,work)=>{live();const result=await read(role,request,async(tx,actor)=>{live();const value=await work(tx,actor);live();return value;});live();return result;});}
const deniedGateway = (): AuthorizationGateway => Object.freeze({
  publicShopName:async()=>deny(),
  verifyAdminPassword: async () => deny(),
  verifySalespersonPassword: async () => deny(),
  issueAdminSession: async () => deny(),
  issueSalespersonSession: async () => deny(),
  logoutAdmin: async () => deny(),
  logoutSalesperson: async () => deny(),
  rotateAdminPassword: async () => deny(),
  rotateSalespersonPassword: async () => deny(),
  authorizeAdmin: async () => deny(),
  authorizeSalesperson: async () => deny(),
  withFreshAdminTransaction: async () => deny(),
  withAdminTransaction: async () => deny(),
  withSalespersonTransaction: async () => deny(),
  close: async () => {},
});
interface BoundSession {
  id: string; userId: string; token: string; expiresAt: Date;
  credentialVersion: string; authEpoch: string; bootGeneration: string; roleBinding: string;
}
function boundSession(value: unknown): BoundSession {
  if (!value || typeof value !== "object") return deny();
  const s = value as Record<string, unknown>;
  for (const field of ["id", "userId", "token", "credentialVersion", "authEpoch", "bootGeneration", "roleBinding"]) {
    if (typeof s[field] !== "string" || s[field] === "") return deny();
  }
  if (!(s.expiresAt instanceof Date) || !Number.isFinite(s.expiresAt.getTime()) || s.id === s.token) return deny();
  return s as unknown as BoundSession;
}

interface CredentialState {
  role: Role; hash: string; credentialVersion: bigint; authEpoch: bigint;
  provisionedAt: bigint; updatedAt: string;
}
function provisioningState(owned: ReturnType<typeof openAsyncOwner>, now: bigint): bigint {
  const setup = owned.get("SELECT format_version,admin_id,salesperson_id,completed_at_ms FROM auth_provisioning WHERE id=?", [BigInt(1)]);
  if (!setup || setup.format_version !== BigInt(1) || setup.admin_id !== "ADMIN" ||
      setup.salesperson_id !== "SALESPERSON" || typeof setup.completed_at_ms !== "bigint" ||
      setup.completed_at_ms <= BigInt(0) || setup.completed_at_ms > now) return deny();
  // Missing either securely provisioned role closes the entire foundation.
  const complete = owned.get(`SELECT count(*) AS n FROM auth_users u
    JOIN auth_credentials c ON c.userId=u.id AND c.accountId=u.id AND c.providerId='credential'
    JOIN auth_principals p ON p.id=u.id WHERE p.provisioned_at_ms=?`, [setup.completed_at_ms]);
  if (complete?.n !== BigInt(2)) return deny();
  return setup.completed_at_ms;
}
function readCredentialState(owned: ReturnType<typeof openAsyncOwner>, role: Role, now: bigint): CredentialState {
  const completed = provisioningState(owned, now);
  const row = owned.get(`SELECT u.id,u.role,c.id AS credential_id,c.accountId,c.providerId,c.password,c.updatedAt,
    p.active,p.credential_version,p.auth_epoch,p.provisioned_at_ms
    FROM auth_users u JOIN auth_credentials c ON c.userId=u.id
    JOIN auth_principals p ON p.id=u.id WHERE u.id=?`, [role]);
  if (!row || row.id !== role || row.role !== role || row.credential_id !== role ||
      row.accountId !== role || row.providerId !== "credential" || row.active !== BigInt(1) ||
      row.provisioned_at_ms !== completed || typeof row.password !== "string" || row.password.length !== 161 ||
      typeof row.updatedAt !== "string" || typeof row.credential_version !== "bigint" ||
      typeof row.auth_epoch !== "bigint" || row.credential_version <= BigInt(0) || row.auth_epoch <= BigInt(0)) return deny();
  return { role, hash: row.password, credentialVersion: int64(row.credential_version),
    authEpoch: int64(row.auth_epoch), provisionedAt: completed, updatedAt: row.updatedAt };
}

export interface AdminMaintenanceOperation { readonly operationId: string; readonly purpose: "UPGRADE8" | "RESTORE41" }
declare const maintenanceSourceBrand: unique symbol;
export interface AdminMaintenanceSource { readonly [maintenanceSourceBrand]: true }
type SourceFacts = Readonly<AdminMaintenanceOperation & { filename: string; device: string; inode: string; schema: 8 | 41; credentialVersion: string; authEpoch: string; productionActivation: false }>;
const maintenanceSources = new WeakMap<object, { facts: SourceFacts; database: DatabaseOptions; lease: BootstrapLease; runtime: unknown }>();
type MaintenanceHook = <T>(proof: unknown, runtime: unknown, operation: AdminMaintenanceOperation, work: (source: AdminMaintenanceSource, lease: BootstrapLease) => Promise<T>) => Promise<T>;
const maintenanceGateways = new WeakMap<object, MaintenanceHook>();
function maintenanceOperation(value: AdminMaintenanceOperation): AdminMaintenanceOperation {
  if (!value || Object.keys(value).sort().join(",") !== "operationId,purpose" ||
      uuid(value.operationId) !== value.operationId || !["UPGRADE8", "RESTORE41"].includes(value.purpose)) return deny();
  return Object.freeze({ operationId: value.operationId, purpose: value.purpose });
}
// Private callback-only source authorization. No HTTP route, owner confirmation,
// pre-copy, SQL/migration, key or destination-admission authority is issued here.
export async function withAdminMaintenanceSource<T>(gateway: AuthorizationGateway, proof: unknown, runtime: unknown, operation: AdminMaintenanceOperation, work: (source: AdminMaintenanceSource, lease: BootstrapLease) => Promise<T>): Promise<T> {
  const hook = gateway && typeof gateway === "object" ? maintenanceGateways.get(gateway) : undefined;
  if (!hook) return deny();
  return hook(proof, runtime, operation, work);
}
export function adminMaintenanceSourceEvidence(source: unknown, database: DatabaseOptions, lease: BootstrapLease, operation: AdminMaintenanceOperation): SourceFacts {
  const saved = source && typeof source === "object" ? maintenanceSources.get(source) : undefined;
  if (!saved || saved.lease !== lease) return deny();
  const requested = maintenanceOperation(operation);
  assertRuntimeOwnership(saved.runtime);
  if (!hasActiveBootstrapLease(lease, saved.database) || !hasActiveBootstrapLease(lease, database) ||
      resolveDatabaseLocation({ ...database, create: false }).filename.toLowerCase() !== saved.facts.filename ||
      requested.operationId !== saved.facts.operationId || requested.purpose !== saved.facts.purpose) return deny();
  return saved.facts;
}

// No eager open, environment secret, default signing key, login or HTTP route.
// Missing configuration is a usable deny-only foundation, never a bypass.
export async function openAuthorizationGateway(config?: AuthorizationConfiguration, requiredSchema?: 35 | 36 | 37 | 38 | 39 | 40 | 41): Promise<AuthorizationGateway> {
  if (!config) return deniedGateway();
  if(requiredSchema!==undefined){
    if(![35,36,37,38,39,40,41].includes(requiredSchema))return deny();
    if(config.database.mode==="persistent"){
      if(requiredSchema!==41||!config.protectedAdmission)return deny();
      try{const admitted=assertProtectedWriterAdmission(config.protectedAdmission,config.database,config.signingSecrets,true);
        if(admitted.schema!==41||admitted.maintenanceOnly||admitted.restored||admitted.generation!=="ROOT")return deny();}
      catch{return deny();}
    }else if(config.database.mode!=="test")return deny();
  }
  if (processState[ownerKey]) return deny();
  const origins = {} as Record<Role, string>;
  try {
    for (const role of roles) {
      const url = new URL(config.origins[role]);
      if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
          config.origins[role] !== url.origin || typeof config.signingSecrets[role] !== "string" ||
          Buffer.byteLength(config.signingSecrets[role]) < 48) return deny();
      origins[role] = url.origin;
    }
    if (new URL(origins.ADMIN).hostname === new URL(origins.SALESPERSON).hostname ||
        config.signingSecrets.ADMIN === config.signingSecrets.SALESPERSON ||
        !Number.isSafeInteger(config.sessionLifetimeSeconds) || config.sessionLifetimeSeconds < 1 || config.sessionLifetimeSeconds > 86400) return deny();
  } catch { return deny(); }
  const sessionLifetimeSeconds = config.sessionLifetimeSeconds; // Validated immutable lifetime for this owner.
  processState[ownerKey] = true;
  const stores = { ADMIN: createVolatileStorage(), SALESPERSON: createVolatileStorage() };
  let owner: ReturnType<typeof openAsyncOwner> | undefined;
  let closed = false, closing = false;
  const active = new Set<Promise<unknown>>();
  let tail: Promise<void> = Promise.resolve();
  let closePromise: Promise<void> | undefined;
  const local = new AsyncLocalStorage<boolean>();
  const boot = randomUUID(); // Non-secret, non-credential process generation.
  let protectedWriter = false;
  let admissionFacts: ReturnType<typeof assertProtectedWriterAdmission> | undefined;
  const admission = (full = true) => { if (protectedWriter) try { assertProtectedWriterAdmission(config.protectedAdmission, config.database, config.signingSecrets, full); } catch { deny(); } };
  const available = () => { if (closed) deny(); admission(false); };
  const track = <T>(operation: Promise<T>) => {
    active.add(operation);
    void operation.finally(() => active.delete(operation)).catch(() => {});
    return operation;
  };
  const enqueue = <T>(work: () => Promise<T>) => {
    const operation = tail.then(work);
    tail = operation.then(() => undefined, () => undefined);
    return track(operation);
  };
  let verification: { role: Role; snapshot?: CredentialState; shared?:boolean; snapshots?:Record<Role,CredentialState> } | undefined;
  type ReceiptState = CredentialState & { boot: string; expiresAtMonotonic: number };
  const receipts = new WeakMap<VerifiedCredential, ReceiptState>();
  let issuing = false, rotating = false;
  let transition = {}; // Replaced on logout: cancels earlier verification/issuance. No identity or bearer.
  let receipt: VerifiedCredential | undefined, receiptController: AbortController | undefined;
  let receiptTimer: ReturnType<typeof setTimeout> | undefined;
  const invalidateReceipt = () => {
    if (receiptTimer) clearTimeout(receiptTimer);
    receiptTimer = undefined;
    if (receipt) receipts.delete(receipt);
    receiptController?.abort(); receiptController = undefined; receipt = undefined;
  };
  const issueReceipt = (snapshot: CredentialState): VerifiedCredential => {
    invalidateReceipt();
    const tick = Math.floor(performance.now());
    if (!Number.isSafeInteger(tick) || tick < 0 || !Number.isSafeInteger(tick + receiptLifetimeMs)) return deny();
    receiptController = new AbortController();
    receipt = Object.freeze({ signal: receiptController.signal }) as VerifiedCredential;
    receipts.set(receipt, { ...snapshot, boot, expiresAtMonotonic: tick + receiptLifetimeMs });
    // Consumption also enforces this monotonic deadline and fresh SQL, never
    // relying on timer delivery or AbortSignal as authorization.
    receiptTimer = setTimeout(invalidateReceipt, receiptLifetimeMs); receiptTimer.unref();
    return receipt;
  };
  try {
    owner = openAsyncOwner(config);
    const owned = owner;
    const marker = owned.get("SELECT user_version FROM pragma_user_version")?.user_version;
    protectedWriter = !!owned.get("SELECT 1 AS present FROM auth_enrollment_binding LIMIT 1");
    if (protectedWriter) {
      let facts; try { facts = assertProtectedWriterAdmission(config.protectedAdmission, config.database, config.signingSecrets, true); } catch { return deny(); }
      admissionFacts = facts;
      if (facts.restored && !config.protectedHistory) return deny();
      if (BigInt(facts.schema) !== marker || (facts.schema === 41 ? requiredSchema !== 41 : requiredSchema !== undefined)) return deny();
    } else if (config.protectedAdmission !== undefined) return deny();
    admission(); // An enrolled candidate cannot opt in through generic TEST flags.
    const requireSchema = async () => {
      admission();
      const schema = protectedWriter && marker === BigInt(8) ? 8 : requiredSchema;
      if (schema !== undefined && !(await validateReviewedSchema({
        get: async (sql, values) => owned.get(sql, values), all: async (sql, values) => owned.all(sql, values),
      }, schema)).ok) return deny();
    };
    // Startup is private and precedes session portals or request admission. Same
    // native handle, one consistent transaction, no manufactured Admin session.
    if (requiredSchema !== undefined) await owned.db.transaction().execute(requireSchema);
    const gatewayTransaction = <T>(adapter: typeof contexts.ADMIN.adapter, work: () => Promise<T>,accountOnly=false) =>
      runWithTransaction(adapter, async () => { await requireSchema();owned.reserve("ADMIN");let live=true; const guard=()=>{available();if(!live||!owned.inTransaction())deny();};try{const validate=accountOnly?assertAccountSettingsLedgers:assertSettingsLedgers;if(requiredSchema===41)await validate(owned.scope(guard,true));const result = await work();if(requiredSchema===41)await validate(owned.scope(guard,true));await requireSchema(); return result;}finally{live=false;} });
    const accountTransaction=<T>(adapter:typeof contexts.ADMIN.adapter,work:()=>Promise<T>)=>gatewayTransaction(adapter,work,true);
    const makePortal = (role: Role) => betterAuth({
      baseURL: origins[role], secret: config.signingSecrets[role],
      database: { db: owned.db, type: "sqlite", transaction: true },
      secondaryStorage: stores[role].storage,
      user: { modelName: "auth_users", additionalFields: { role: { type: "string", required: true, input: false } } },
      account: { modelName: "auth_credentials" },
      session: {
        // Secondary storage deliberately omits the framework SQL session model.
        storeSessionInDatabase: false, preserveSessionInDatabase: false,
        expiresIn: sessionLifetimeSeconds, disableSessionRefresh: true,
        cookieCache: { enabled: false },
        additionalFields: {
          credentialVersion: { type: "string", required: true, input: false },
          authEpoch: { type: "string", required: true, input: false },
          bootGeneration: { type: "string", required: true, input: false, defaultValue: boot },
          roleBinding: { type: "string", required: true, input: false, defaultValue: role },
        }
      },
      // BOTH private role portals explicitly share the owner-approved 8+ callbacks.
      emailAndPassword: {
        enabled: false, disableSignUp: true, password: passwordCallbacks,
        minPasswordLength: passwordPolicy.minCharacters,
        // Framework prechecks count UTF-16 units; callback enforces scalar/byte limits.
        maxPasswordLength: passwordPolicy.maxCharacters * 2,
      },
      trustedOrigins: [origins[role]],
      advanced: { useSecureCookies: true, cookiePrefix: role === "ADMIN" ? "pos-admin" : "pos-salesperson",
        defaultCookieAttributes: { httpOnly: true, secure: true, sameSite: "strict", path: "/" } },
      telemetry: { enabled: false }, logger: { disabled: true },
    });
    const portals = { ADMIN: makePortal("ADMIN"), SALESPERSON: makePortal("SALESPERSON") };
    // Initialize both private contexts before accepting requests; never return them.
    const contexts = { ADMIN: await portals.ADMIN.$context, SALESPERSON: await portals.SALESPERSON.$context };
    for (const role of roles) if (contexts[role].password.verify !== passwordCallbacks.verify ||
      contexts[role].password.hash !== passwordCallbacks.hash) return deny();
    const securityTime = () => {
      const time = Date.now();
      if (!Number.isSafeInteger(time) || time <= 0) return deny();
      return int64(BigInt(time));
    };
    const provisioned = (now: bigint) => provisioningState(owned, now);
    const credentialState = (role: Role) => readCredentialState(owned, role, securityTime());
    const quarantine = () => {
      closed = true; invalidateReceipt();
      for (const role of roles) try { stores[role].clear(); } catch { /* Closed denies even if RAM cleanup fails. */ }
      owned.quarantine();
    };
    const quarantineIfNeeded = () => { if (owned.inTransaction()) quarantine(); };
    const sameCredential = (state: CredentialState, saved: CredentialState) =>
      (Object.keys(state) as (keyof CredentialState)[]).every(key => state[key] === saved[key]);
    const attempts = createLoginAttemptProtection({
      owner: owned,
      withOwnerTransaction: async <T>(work: () => Promise<T>): Promise<T> => {
        const current = verification;
        if (!current || local.getStore()) return deny();
        return enqueue(async () => {
          try {
            return await accountTransaction(contexts[current.role].adapter, async () => {
              available();
              if (closing || verification !== current) return deny();
              owned.reserve(current.role);
              if(current.shared){
                const snapshots={ADMIN:credentialState("ADMIN"),SALESPERSON:credentialState("SALESPERSON")};
                if(current.snapshots&&roles.some(role=>!sameCredential(snapshots[role],current.snapshots![role])))return deny();
                current.snapshots??=snapshots;
              }
              const state = credentialState(current.role);
              // Equality here detects changed trusted SQL state, never verifies a password.
              if (current.snapshot && !sameCredential(state, current.snapshot)) return deny();
              const result = await local.run(true, work);
              if (closing) return deny();
              current.snapshot ??= state;
              return result;
            });
          } catch { quarantineIfNeeded(); return deny(); }
        });
      },
      verifyCredential: async (role, password) => {
        const current = verification;
        if(!current||typeof password!=="string"||closing||closed)return false;
        if(current.shared){if(!current.snapshots)return false;return local.run(true,()=>contexts[role].password.verify({hash:current.snapshots![role].hash,password}));}
        if(current.role!==role||!current.snapshot)return false;
        // Actual pinned private Better Auth callback; no public API/checkPassword
        // lookup, default verifier, session issuance or client-selected hash.
        return local.run(true, () => contexts[role].password.verify({ hash: current.snapshot!.hash, password }));
      },
    });
    const verify = (role: Role, password: unknown): Promise<VerifiedCredential> => {
      if (local.getStore() || closed || closing || verification || issuing || rotating) return Promise.reject(new AuthorizationDenied());
      invalidateReceipt();
      const admitted = transition;
      const current: { role: Role; snapshot?: CredentialState } = { role };
      verification = current; // Before any await: fail fast, no KDF/waiter queue.
      return track((async () => {
        try {
          await (role === "ADMIN" ? attempts.verifyAdminPassword(password) : attempts.verifySalespersonPassword(password));
          available();
          if (closing || admitted !== transition || !current.snapshot) return deny();
          return issueReceipt(current.snapshot);
        } catch { invalidateReceipt(); return deny(); } // Transaction runners quarantine only their own failures.
        finally { verification = undefined; }
      })());
    };
    const authority = (role: Role, session: BoundSession): Actor => {
      const now = securityTime(); provisioned(now);
      const row = owned.get(`SELECT u.id,u.role,p.active,p.credential_version,p.auth_epoch,
        r.credential_version AS session_version,r.auth_epoch AS session_epoch,
        r.boot_generation,r.created_at_ms,r.expires_at_ms,r.revoked_at_ms
        FROM auth_users u JOIN auth_principals p ON p.id=u.id
        JOIN auth_session_authorizations r ON r.principal_id=p.id
        WHERE r.session_id=? AND u.id=?`, [session.id, role]);
      if (!row || row.id !== role || row.role !== role || row.active !== BigInt(1) ||
          row.revoked_at_ms !== null || row.boot_generation !== boot ||
          session.userId !== role || session.roleBinding !== role || session.bootGeneration !== boot ||
          row.credential_version !== row.session_version || row.auth_epoch !== row.session_epoch ||
          String(row.credential_version) !== session.credentialVersion || String(row.auth_epoch) !== session.authEpoch ||
          typeof row.created_at_ms !== "bigint" || row.created_at_ms > now ||
          typeof row.expires_at_ms !== "bigint" || row.expires_at_ms <= now ||
          session.expiresAt.getTime() <= Date.now()) return deny();
      return Object.freeze({ principalId: role, role, sessionId: session.id });
    };
    const receiptLive = (saved: ReceiptState) => {
      const tick = Math.floor(performance.now());
      if(tick>=saved.expiresAtMonotonic){const events=channel("shop-pos.test.cash-proof-window");if(events.hasSubscribers)try{events.publish({stage:"PROOF_EXPIRED",tick,overdueMs:tick-saved.expiresAtMonotonic});}catch{/* Observers cannot alter denial. */}}
      if (!Number.isSafeInteger(tick) || tick < saved.expiresAtMonotonic - receiptLifetimeMs ||
          tick >= saved.expiresAtMonotonic || saved.boot !== boot) return deny();
      return tick;
    };
    const issue = (role: Role, value: unknown): Promise<Response> => {
      let saved: ReceiptState;
      try {
        if (!value || typeof value !== "object") return deny();
        const candidate = value as VerifiedCredential, found = receipts.get(candidate);
        if (!found) return deny(); // No getter or framework call for forged objects.
        const aborted = candidate.signal.aborted;
        receipts.delete(candidate); invalidateReceipt(); // Burn before ANY later failure.
        saved = found;
        if (aborted || saved.role !== role || local.getStore() || closed || closing ||
            verification || issuing || rotating || owned.inTransaction()) return deny();
        receiptLive(saved);
      } catch { return Promise.reject(new AuthorizationDenied()); }
      const admitted = transition;
      issuing = true; // Synchronous admission: no concurrent issuance/verification queue.
      return enqueue(() => local.run(true, async () => {
        let created: Awaited<ReturnType<typeof contexts.ADMIN.internalAdapter.createSession>> | undefined;
        let registered = false, creationStarted = false, transactionStarted = false;
        const current = () => {
          available(); if (closing || admitted !== transition || !owned.inTransaction()) return deny(); receiptLive(saved);
          const state = credentialState(role);
          if (!sameCredential(state, saved)) return deny();
          return state;
        };
        try {
          // The core helper joins an inherited adapter context. Reject it before
          // BEGIN; this capability must own its transaction and COMMIT boundary.
          if (owned.inTransaction() || await getCurrentAdapter(contexts[role].adapter) !== contexts[role].adapter) return deny();
          transactionStarted = true;
          const response = await accountTransaction(contexts[role].adapter, async () => {
            available(); if (closing || !owned.inTransaction()) return deny();
            owned.reserve(role);
            current(); // Holds writer from this read through registration COMMIT.
            const now = securityTime(), expires = int64(now + BigInt(sessionLifetimeSeconds * 1000));
            // JavaScript Date is used only after exact safe timestamp range validation.
            if (expires > BigInt(8640000000000000)) return deny();
            // Supported pinned context API generates both ID and bearer itself.
            // getCurrentAdapter inside createSession joins this SAME transaction.
            creationStarted = true;
            created = await contexts[role].internalAdapter.createSession(role, true, {
              credentialVersion: String(saved.credentialVersion), authEpoch: String(saved.authEpoch),
              bootGeneration: boot, roleBinding: role, createdAt: new Date(Number(now)),
              updatedAt: new Date(Number(now)), expiresAt: new Date(Number(expires)),
            }, true);
            const session = boundSession(created);
            if (created.createdAt.getTime() !== Number(now) || session.expiresAt.getTime() !== Number(expires)) return deny();
            const user = await contexts[role].internalAdapter.findUserById(role);
            if (!user || user.id !== role) return deny();
            if (owned.run("INSERT INTO auth_session_authorizations VALUES(?,?,?,?,?,?,?,NULL)", [
              session.id, role, saved.credentialVersion, saved.authEpoch, boot, now, expires,
            ]).changes !== BigInt(1)) return deny();
            registered = true;
            // Official pathless serverOnly helper: no URL, plugin route or raw API.
            // Cookies are staged privately INSIDE the transaction, never published here.
            const cookieEndpoint = createAuthEndpoint.serverOnly({
              method: "POST", metadata: { noStore: true },
            }, async ctx => {
              await setSessionCookie(ctx, { session: created!, user }, true);
              return { ok: true };
            });
            const staged = await cookieEndpoint({ context: contexts[role], headers: new Headers(), returnHeaders: true });
            current(); authority(role, session);
            return new Response(JSON.stringify({ ok: true }), {
              status: 200, headers: new Headers([...staged.headers, ["content-type", "application/json"]]),
            });
          });
          // Promise resolution is after the driver's COMMIT, not just handler completion.
          if (owned.inTransaction()) { quarantine(); return deny(); }
          available(); if (closing || admitted !== transition) return deny();
          return response;
        } catch {
          // A failed/uncertain publication never leaves a live SQL authorization,
          // even if framework deletion AND RAM clearing both fail.
          if (transactionStarted && owned.inTransaction()) quarantine();
          else if (registered && created) {
            try {
              await accountTransaction(contexts[role].adapter, async () => {
                if (!owned.inTransaction()) return deny();
                owned.run("UPDATE auth_session_authorizations SET revoked_at_ms=created_at_ms " +
                  "WHERE session_id=? AND principal_id=? AND boot_generation=?", [created!.id, role, boot]);
                const row = owned.get("SELECT revoked_at_ms FROM auth_session_authorizations WHERE session_id=?", [created!.id]);
                if (row && row.revoked_at_ms === null) return deny();
              });
              if (owned.inTransaction()) quarantine();
            } catch { quarantine(); } // SQL ambiguity poisons this entire owner.
          }
          try {
            if (created) await contexts[role].internalAdapter.deleteSession(created.token);
            else if (creationStarted) stores[role].clear(); // Only a started creation can leave partial RAM.
          } catch { try { stores[role].clear(); } catch { /* No live SQL row, or owner closed. */ } }
          return deny(); // Discard staged headers and underlying errors unconditionally.
        } finally { issuing = false; }
      }));
    };
    const validateRequest = (role: Role, request: Request) => {
      const url = new URL(request.url);
      if (url.origin !== origins[role] || (request.headers.has("origin") && request.headers.get("origin") !== origins[role]) ||
          (request.headers.has("host") && request.headers.get("host") !== url.host)) return deny();
    };
    const logout = (role: Role, request: Request): Promise<Response> => {
      // Reject nesting BEFORE changing a transition or joining the serialized owner.
      if (local.getStore() || closed || closing) return Promise.reject(new AuthorizationDenied());
      try { validateRequest(role, request); } catch { return Promise.reject(new AuthorizationDenied()); }
      transition = {}; invalidateReceipt(); // No earlier password proof may survive Back to Login.
      return enqueue(() => local.run(true, async () => {
        let started = false;
        try {
          available(); validateRequest(role, request);
          if (owned.inTransaction() || await getCurrentAdapter(contexts[role].adapter) !== contexts[role].adapter) return deny();
          started = true;
          // SQL unavailable is an error even for a missing, expired or invalid cookie.
          await owned.db.selectFrom("auth_principals").selectAll().limit(0).execute();
          const verified = await portals[role].api.getSession({
            headers: request.headers, query: { disableCookieCache: true, disableRefresh: true },
          });
          const session = verified ? boundSession(verified.session) : undefined;
          if (session && (session.userId !== role || session.roleBinding !== role || session.bootGeneration !== boot)) return deny();
          await accountTransaction(contexts[role].adapter, async () => {
            available(); if (!owned.inTransaction()) return deny();
            owned.reserve(role);
            const now = securityTime(); provisioned(now);
            // Confirm registry availability for idempotent no-session logout too.
            owned.get("SELECT session_id FROM auth_session_authorizations LIMIT 0");
            if (!session) return; // Already unauthenticated; no guessed identity/row is revoked.
            const row = owned.get("SELECT * FROM auth_session_authorizations WHERE session_id=?", [session.id]);
            if (!row) return; // No SQL grant exists. Only this verified RAM session is cleaned.
            if (row.principal_id !== role || row.boot_generation !== boot ||
                typeof row.credential_version !== "bigint" || row.credential_version <= BigInt(0) ||
                typeof row.auth_epoch !== "bigint" || row.auth_epoch <= BigInt(0) ||
                String(row.credential_version) !== session.credentialVersion || String(row.auth_epoch) !== session.authEpoch ||
                typeof row.created_at_ms !== "bigint" || row.created_at_ms <= BigInt(0) || row.created_at_ms > now ||
                typeof row.expires_at_ms !== "bigint" || row.expires_at_ms !== BigInt(session.expiresAt.getTime()) ||
                (row.revoked_at_ms !== null && (typeof row.revoked_at_ms !== "bigint" || row.revoked_at_ms < row.created_at_ms))) return deny();
            if (row.revoked_at_ms === null && owned.run(
              "UPDATE auth_session_authorizations SET revoked_at_ms=? WHERE session_id=? AND principal_id=? AND boot_generation=? AND revoked_at_ms IS NULL",
              [now, session.id, role, boot]).changes !== BigInt(1)) return deny();
            const confirmed = owned.get("SELECT revoked_at_ms FROM auth_session_authorizations WHERE session_id=?", [session.id]);
            if (!confirmed || typeof confirmed.revoked_at_ms !== "bigint") return deny();
          });
          // Authoritative confirmation is AFTER native COMMIT, before RAM/cookie cleanup.
          if (owned.inTransaction()) return deny();
          available();
          if (session) {
            try { await contexts[role].internalAdapter.deleteSession(session.token); }
            catch {
              // Pinned secondaryStorage session key is exactly its framework token.
              // Never clear a whole role store and accidentally log out another session.
              try { await stores[role].storage.delete(session.token); } catch { /* Confirmed SQL revocation still denies access. */ }
            }
          }
          const cookieEndpoint = createAuthEndpoint.serverOnly({ method: "POST", metadata: { noStore: true } }, async ctx => {
            deleteSessionCookie(ctx); return { ok: true };
          });
          const cleared = await cookieEndpoint({ context: contexts[role], headers: request.headers, returnHeaders: true });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200, headers: new Headers([...cleared.headers, ["content-type", "application/json"]]),
          });
        } catch {
          // An uncertain lookup/revocation/COMMIT closes this owner, never reports success.
          // Closed admission denies even if SQLite rolled back and RAM cleanup also fails.
          if (started) quarantine();
          return deny();
        }
      }));
    };
    const rotate = (target: Role, incoming: Request, value: unknown, password: unknown, opKey?:PasswordOperationKey): Promise<void> => {
      let saved: ReceiptState, request: Request;
      try {
        if (!value || typeof value !== "object") return deny();
        const candidate = value as VerifiedCredential, found = receipts.get(candidate);
        if (!found) return deny();
        const aborted = candidate.signal.aborted;
        receipts.delete(candidate); invalidateReceipt(); // Burn even on later denial/failure.
        saved = found;
        if (aborted || saved.role !== "ADMIN" || local.getStore() || closed || closing ||
            verification || issuing || rotating || owned.inTransaction()) return deny();
        receiptLive(saved); validateRequest("ADMIN", incoming);
        if(requiredSchema===41){const o=object(opKey,["key","context"]);uuid(o.key);text(o.context,64);opKey=Object.freeze({key:String(o.key),context:String(o.context)});}else if(opKey!==undefined)return deny();
        request = new Request(incoming.url, { headers: new Headers(incoming.headers) });
      } catch { return Promise.reject(new AuthorizationDenied()); }
      const admitted = transition;
      rotating = true; // Before await: one KDF operation, no rotation/login waiter queue.
      return track((async () => {
        let operation: { lastTick: number; expiresAt: number } | undefined;
        const live = () => {
          available(); if (closing || admitted !== transition || saved.boot !== boot) return deny();
          if (!operation) { receiptLive(saved); return; } // Fresh proof through initial SQL snapshot.
          const tick = Math.floor(performance.now());
          if (!Number.isSafeInteger(tick) || tick < operation.lastTick || tick >= operation.expiresAt) return deny();
          operation.lastTick = tick; // Conservative rollback detection; deadline never slides.
        };
        // Two short owned transactions with expensive password work BETWEEN them.
        const phase = <T>(mutates: boolean, work: (session: BoundSession) => Promise<T>) =>
          enqueue(() => local.run(true, async () => {
            let started = false, completed = false;
            try {
              live();
              if (owned.inTransaction() || await getCurrentAdapter(contexts.ADMIN.adapter) !== contexts.ADMIN.adapter) return deny();
              validateRequest("ADMIN", request);
              await owned.db.selectFrom("auth_principals").selectAll().limit(0).execute();
              const verified = await portals.ADMIN.api.getSession({
                headers: request.headers, query: { disableCookieCache: true, disableRefresh: true },
              });
              const session = boundSession(verified?.session);
              started = true;
              const result = await runWithTransaction(contexts.ADMIN.adapter, async () => {
                live(); if (!owned.inTransaction()) return deny();
                owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id=?", ["ADMIN"]);
                authority("ADMIN", session);
                if (!sameCredential(credentialState("ADMIN"), saved)) return deny();
                if(requiredSchema===41){await requireSchema();await assertSettingsLedgers(owned.scope(live));if(!opKey||opKey.context!==await settingsContext(owned.scope(live))||owned.get("SELECT request_key FROM shop_settings_operations WHERE request_key=?",[opKey.key])||owned.get("SELECT request_key FROM shop_password_operations WHERE request_key=?",[opKey.key])||owned.get("SELECT request_key FROM shop_settings_cancellations WHERE request_key=?",[opKey.key]))return deny();}
                const result = await work(session);
                if(requiredSchema===41){await assertSettingsLedgers(owned.scope(live));await requireSchema();}
                live(); if (!owned.inTransaction() || BigInt(session.expiresAt.getTime()) <= securityTime()) return deny();
                if (!mutates) authority("ADMIN", session);
                completed = true;
                return result;
              });
              if (owned.inTransaction()) { quarantine(); return deny(); }
              available();
              if (mutates) {
                // After confirmed COMMIT, still under the SAME queue. This role
                // portal/store contains only the changed identity's RAM sessions.
                try { await contexts[target].internalAdapter.deleteUserSessions(target); } catch { /* SQL versions/revocation deny. */ }
                try { stores[target].clear(); } catch { /* Surviving RAM cannot authorize. */ }
                invalidateReceipt();
              }
              return result;
            } catch {
              // Callback failure with confirmed rollback leaves old credentials intact.
              // COMMIT/acknowledgment uncertainty poisons the owner, never reports success.
              if (started && (owned.inTransaction() || (mutates && completed))) quarantine();
              return deny();
            }
          }));
        try {
          const before = await phase(false, async session => ({
            sessionId: session.id, ADMIN: credentialState("ADMIN"), SALESPERSON: credentialState("SALESPERSON"),
          }));
          // The consumed proof must STILL be fresh when trusted authorization has
          // completed. Only then create this private, once-only execution lifecycle.
          const started = receiptLive(saved), expiresAt = started + rotationOperationLifetimeMs;
          if (!Number.isSafeInteger(expiresAt)) return deny();
          operation = { lastTick: started, expiresAt };
          live(); assertOfflinePassword(password);
          // A false login verifier can also mean native failure. These checks share
          // its exact native comparison core but throw on ANY operational/format error.
          await local.run(true, () => assertPasswordNotReused(password, before.ADMIN.hash)); live();
          await local.run(true, () => assertPasswordNotReused(password, before.SALESPERSON.hash)); live();
          const encoded = await local.run(true, () => contexts[target].password.hash(password)); live();
          await phase(true, async session => {
            if (session.id !== before.sessionId ||
                !sameCredential(credentialState("ADMIN"), before.ADMIN) ||
                !sameCredential(credentialState("SALESPERSON"), before.SALESPERSON)) return deny();
            const previous = before[target], other = target === "ADMIN" ? "SALESPERSON" : "ADMIN";
            const version = int64(previous.credentialVersion + BigInt(1)), epoch = int64(previous.authEpoch + BigInt(1));
            const now = securityTime(), date = new Date(Number(now));
            // Conservative clock handling; never repair future-dated registrations.
            if (!Number.isFinite(date.getTime()) || owned.get(
              "SELECT count(*) AS n FROM auth_session_authorizations WHERE principal_id=? AND revoked_at_ms IS NULL AND created_at_ms>?",
              [target, now])?.n !== BigInt(0)) return deny();
            // Supported pinned helper resolves getCurrentAdapter and joins this tx.
            const changed = await contexts[target].internalAdapter.updateAccount(target, { password: encoded, updatedAt: date });
            live(); if (!owned.inTransaction() || !changed || changed.id !== target) return deny();
            if (owned.run("UPDATE auth_principals SET credential_version=?,auth_epoch=? " +
                "WHERE id=? AND active=1 AND credential_version=? AND auth_epoch=?",
              [version, epoch, target, previous.credentialVersion, previous.authEpoch]).changes !== BigInt(1)) return deny();
            owned.run("UPDATE auth_session_authorizations SET revoked_at_ms=? WHERE principal_id=? AND revoked_at_ms IS NULL", [now, target]);
            const expected = { ...previous, hash: encoded, credentialVersion: version, authEpoch: epoch, updatedAt: date.toISOString() };
            // Hash string equality confirms trusted SQL writes, never verifies plaintext.
            if (!sameCredential(credentialState(target), expected) ||
                !sameCredential(credentialState(other), before[other]) || owned.get(
                  "SELECT count(*) AS n FROM auth_session_authorizations WHERE principal_id=? AND revoked_at_ms IS NULL",
                  [target])?.n !== BigInt(0)) return deny();
            if (target !== "ADMIN") authority("ADMIN", session);
            if(requiredSchema===41){if(!opKey)return deny();if(owned.run("INSERT INTO shop_password_operations VALUES(?,?,?,?,?,?,?,?,?,?,?)",[opKey.key,opKey.key,opKey.context,target,previous.credentialVersion,version,previous.authEpoch,epoch,"ADMIN",session.id,now]).changes!==BigInt(1))return deny();const audit=owned.get("SELECT * FROM shop_password_operations WHERE request_key=?",[opKey.key]);if(!audit||audit.context!==opKey.context||audit.target!==target||audit.before_version!==previous.credentialVersion||audit.after_version!==version||audit.before_epoch!==previous.authEpoch||audit.after_epoch!==epoch||audit.actor_id!=="ADMIN"||audit.session_ref!==session.id||audit.recorded_at_ms!==now)return deny();}
            // Self-rotation deliberately invalidates this Admin session at COMMIT.
          });
        } catch { return deny(); }
        finally { rotating = false; }
      })());
    };
    const execute = <T>(role: Role, request: Request, work: (tx: AuthorizedTransaction, actor: Actor) => Promise<T>,readOnly=false) => {
      if (local.getStore() || closed || closing) return Promise.reject(new AuthorizationDenied());
      return enqueue(async () => {
        try {
          available();
          validateRequest(role, request);
          // Check authoritative SQL availability even before resolving the cookie.
          await owned.db.selectFrom("auth_principals").selectAll().limit(0).execute();
          const verified = await portals[role].api.getSession({
            headers: request.headers, query: { disableCookieCache: true, disableRefresh: true }
          });
          const session = boundSession(verified?.session);
          return await gatewayTransaction(contexts[role].adapter, async () => {
            available();
            // Kysely's supported SQLite transaction starts deferred. This no-change
            // UPDATE acquires the writer reservation BEFORE the authorization read,
            // excluding external revocation/check/write races through COMMIT.
            owned.reserve(role);
            const actor = authority(role, session);
            let live = true;
            const guard = () => { available(); if (!live || !owned.inTransaction()) deny(); };
            try {
              return await local.run(true, async () => {
                const result = await work(owned.scope(guard,readOnly), actor);
                guard(); authority(role, session); // Expiry/revocation before publication/commit.
                return result;
              });
            } finally { live = false; }
          },readOnly);
        } catch {
          quarantineIfNeeded();
          return deny();
        }
      });
      // Generic errors only; no SQL details or nested causes.
    };
    const fresh = <T>(request:Request,value:unknown,work:(tx:AuthorizedTransaction,actor:Actor)=>Promise<T>):Promise<T> => {
      let saved:ReceiptState;
      try {
        if(!value||typeof value!=="object")return deny();
        const candidate=value as VerifiedCredential,found=receipts.get(candidate);
        if(!found)return deny();
        const aborted=candidate.signal.aborted;receipts.delete(candidate);invalidateReceipt();saved=found;
        if(aborted||saved.role!=="ADMIN"||local.getStore()||closed||closing||verification||issuing||rotating)return deny();
        receiptLive(saved);validateRequest("ADMIN",request);
      }catch{return Promise.reject(new AuthorizationDenied());}
      const admitted=transition,copy=new Request(request.url,{headers:new Headers(request.headers)});
      return execute("ADMIN",copy,async(tx,actor)=>{
        const live=()=>{available();receiptLive(saved);if(closing||admitted!==transition||!sameCredential(credentialState("ADMIN"),saved))return deny();};
        live();const result=await work(tx,actor);live();return result;
      });
    };
    // A handoff reserves this existing close operation synchronously. It drains
    // the same queue, validates fresh SQL, closes its only native handle, then
    // enters bootstrap ownership WITHOUT yielding between the process markers.
    const closeGateway = (beforeClose?: () => Promise<void>, afterClose?: () => Promise<void>): Promise<void> => {
      if (local.getStore()) return Promise.reject(new AuthorizationDenied());
      if (!closePromise) {
        closing = true; invalidateReceipt();
        closePromise = (async () => {
          await Promise.allSettled(active);
          let rejected = false;
          try { await beforeClose?.(); } catch { rejected = true; }
          closed = true; invalidateReceipt(); clearReviewedSchemaAdmission();
          for (const role of roles) try { stores[role].clear(); } catch { /* Always close SQLite. */ }
          try { await owned.close(); } catch { owned.quarantine(); return deny(); }
          delete processState[ownerKey];
          if (rejected) return deny();
          // Calling the async function executes its initial ownership claim NOW.
          if (afterClose) await afterClose();
        })();
      }
      return closePromise;
    };
    const sourceConfiguration = Object.freeze({ database: Object.freeze({ ...config.database, create: false }), migrationsDirectory: config.migrationsDirectory, restoreProof: config.restoreProof, protectedHistory: config.protectedHistory, protectedAdmission: config.protectedAdmission });
    const maintenance: MaintenanceHook = async <T>(value: unknown, runtime: unknown, input: AdminMaintenanceOperation, work: (source: AdminMaintenanceSource, lease: BootstrapLease) => Promise<T>): Promise<T> => {
      let saved: ReceiptState, operation: AdminMaintenanceOperation;
      try {
        if (!value || typeof value !== "object") return deny();
        const candidate = value as VerifiedCredential, found = receipts.get(candidate);
        if (!found) return deny();
        const aborted = candidate.signal.aborted;
        receipts.delete(candidate); invalidateReceipt(); saved = found; // One-use even on later rejection.
        if (aborted || saved.role !== "ADMIN" || local.getStore() || closed || closing || verification || issuing || rotating || typeof work !== "function") return deny();
        receiptLive(saved); assertRuntimeOwnership(runtime); operation = maintenanceOperation(input);
      } catch { return deny(); }
      const identity = owned.fileIdentity();
      let result!: T;
      await closeGateway(async () => {
        assertRuntimeOwnership(runtime); receiptLive(saved);
        if (await getCurrentAdapter(contexts.ADMIN.adapter) !== contexts.ADMIN.adapter) return deny();
        await enqueue(() => gatewayTransaction(contexts.ADMIN.adapter, async () => {
          available(); receiptLive(saved); assertRuntimeOwnership(runtime);
          owned.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id=?", ["ADMIN"]);
          if (!sameCredential(credentialState("ADMIN"), saved)) return deny();
          const schema = operation.purpose === "UPGRADE8" ? 8 : 41;
          if ((schema === 41 && requiredSchema !== 41) || !(await validateReviewedSchema({ get: async (sql, values) => owned.get(sql, values), all: async (sql, values) => owned.all(sql, values) }, schema)).ok) return deny();
          if (JSON.stringify(owned.fileIdentity()) !== JSON.stringify(identity)) return deny();
          receiptLive(saved); assertRuntimeOwnership(runtime);
        }));
      }, () => withHeldBootstrapOwnership(sourceConfiguration.database, runtime, async (retain, lease) => {
        // Reopen only AFTER the old native handle has closed. Recheck source SQL
        // and actual file identity under the same runtime+bootstrap fence before
        // minting a scope; path replacement or credential revocation denies.
        let inspector: ReturnType<typeof openAsyncOwner> | undefined;
        const schema = operation.purpose === "UPGRADE8" ? 8 : 41;
        try {
          inspector = openAsyncOwner(sourceConfiguration); const reader = inspector;
          await reader.db.transaction().execute(async () => {
            assertRuntimeOwnership(runtime);
            reader.run("UPDATE auth_principals SET auth_epoch=auth_epoch WHERE id=?", ["ADMIN"]);
            if (JSON.stringify(reader.fileIdentity()) !== JSON.stringify(identity) || !sameCredential(readCredentialState(reader, "ADMIN", securityTime()), saved) ||
                !(await validateReviewedSchema({ get: async (sql, values) => reader.get(sql, values), all: async (sql, values) => reader.all(sql, values) }, schema)).ok) return deny();
          });
        } finally {
          if (inspector) try { await inspector.close(); } catch { retain(); inspector.quarantine(); return deny(); }
        }
        const source = Object.freeze({ toJSON: deny }) as unknown as AdminMaintenanceSource;
        const facts: SourceFacts = Object.freeze({ ...operation, ...identity, schema, credentialVersion: String(saved.credentialVersion), authEpoch: String(saved.authEpoch), productionActivation: false });
        maintenanceSources.set(source, { facts, database: sourceConfiguration.database, lease, runtime });
        try {
          adminMaintenanceSourceEvidence(source, sourceConfiguration.database, lease, operation);
          result = await local.run(true, () => work(source, lease));
          adminMaintenanceSourceEvidence(source, sourceConfiguration.database, lease, operation);
        } finally { maintenanceSources.delete(source); }
      }));
      return result;
    };
    const gateway: AuthorizationGateway = Object.freeze({
      publicShopName:()=>{if(requiredSchema!==41||local.getStore()||closed||closing)return Promise.reject(new AuthorizationDenied());return enqueue(()=>owned.db.transaction().execute(async()=>{available();await requireSchema();const guard=()=>{available();if(!owned.inTransaction())deny();};const tx=owned.scope(guard,true);await assertAccountSettingsLedgers(tx);const value=await currentSettings(tx);guard();await requireSchema();return value?.settings.shopName??null;}));},
      withFreshAdminTransaction:fresh,
      verifyAdminPassword: (password: unknown) => verify("ADMIN", password),
      verifySalespersonPassword: (password: unknown) => verify("SALESPERSON", password),
      issueAdminSession: (value: unknown) => issue("ADMIN", value),
      issueSalespersonSession: (value: unknown) => issue("SALESPERSON", value),
      logoutAdmin: (request: Request) => logout("ADMIN", request),
      logoutSalesperson: (request: Request) => logout("SALESPERSON", request),
      rotateAdminPassword: (request: Request, proof: unknown, password: unknown, operation?:PasswordOperationKey) => rotate("ADMIN", request, proof, password, operation),
      rotateSalespersonPassword: (request: Request, proof: unknown, password: unknown, operation?:PasswordOperationKey) => rotate("SALESPERSON", request, proof, password, operation),
      authorizeAdmin: (request: Request) => execute("ADMIN", request, async (_tx, actor) => actor,true),
      authorizeSalesperson: (request: Request) => execute("SALESPERSON", request, async (_tx, actor) => actor,true),
      withAdminTransaction: <T>(request: Request, work: (tx: AuthorizedTransaction, actor: Actor) => Promise<T>) => execute("ADMIN", request, work),
      withSalespersonTransaction: <T>(request: Request, work: (tx: AuthorizedTransaction, actor: Actor) => Promise<T>) => execute("SALESPERSON", request, work),
      close: () => closeGateway(),
    });
    if (admissionFacts?.maintenanceOnly) {
      const recovery = Object.freeze({ ...deniedGateway(), verifyAdminPassword: gateway.verifyAdminPassword, close: gateway.close });
      maintenanceGateways.set(recovery, maintenance); return recovery;
    }
    if (admissionFacts?.generation === "READBACK_ONLY") {
      return Object.freeze({ ...deniedGateway(), verifyAdminPassword: gateway.verifyAdminPassword, verifySalespersonPassword: gateway.verifySalespersonPassword,
        issueAdminSession: gateway.issueAdminSession, issueSalespersonSession: gateway.issueSalespersonSession, authorizeAdmin: gateway.authorizeAdmin,
        authorizeSalesperson: gateway.authorizeSalesperson, logoutAdmin: gateway.logoutAdmin, logoutSalesperson: gateway.logoutSalesperson, close: gateway.close });
    }
    sharedCredentialReaders.set(gateway,(password:unknown)=>{
      if(typeof password!=="string"||password.length>256||Array.from(password).length<8||Array.from(password).length>128||Buffer.byteLength(password)>512||local.getStore()||closed||closing||verification||issuing||rotating)return Promise.reject(new AuthorizationDenied());
      invalidateReceipt();const admitted=transition;
      const current:{role:Role;snapshot?:CredentialState;shared?:boolean;snapshots?:Record<Role,CredentialState>}={role:"ADMIN",shared:true};verification=current;
      return track((async()=>{try{const role=await attempts.verifySharedPassword(password);available();if(closing||admitted!==transition||!current.snapshots)return deny();current.role=role;return Object.freeze({role,receipt:issueReceipt(current.snapshots[role])});}catch{invalidateReceipt();return deny();}finally{verification=undefined;}})());
    });
    dependencyReaders.set(gateway,<T>(role:Role,request:Request,work:(tx:AuthorizedTransaction,actor:Actor)=>Promise<T>)=>execute(role,request,work,true));
    maintenanceGateways.set(gateway, maintenance);
    return gateway;
  } catch {
    invalidateReceipt(); clearReviewedSchemaAdmission(); stores.ADMIN.clear(); stores.SALESPERSON.clear();
    try { if (owner) await owner.close(); } catch { owner?.quarantine(); return deny(); }
    delete processState[ownerKey];
    return deny();
  }
}
