/* eslint-disable @typescript-eslint/no-explicit-any -- this test reads untyped JSON replies from a remote HTTP API */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Runs the Part 1 cloud migrations' security and stream rules against a dedicated STAGING Supabase project.
// Skipped unless web/.env.cloud-staging exists (git-ignored). Never point this at the production project.
// No secret is ever printed; the MFA secret is read from, or appended to, the git-ignored env file only.

const envFile = path.resolve(process.cwd(), ".env.cloud-staging");
function readEnv(): Record<string, string> {
  if (!existsSync(envFile)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return values;
}
const env = readEnv();
const configured = ["CLOUD_STAGING_URL", "CLOUD_STAGING_PUBLISHABLE_KEY", "CLOUD_STAGING_OWNER_EMAIL", "CLOUD_STAGING_OWNER_PASSWORD"].every(k => env[k]);
const url = (env.CLOUD_STAGING_URL ?? "").replace(/\/$/, "");
const apikey = env.CLOUD_STAGING_PUBLISHABLE_KEY ?? "";

interface Session { token: string }
interface Reply { status: number; body: any }

async function call(pathname: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<Reply> {
  const response = await fetch(url + pathname, {
    method: init.method ?? "POST",
    headers: { apikey, "Content-Type": "application/json", Authorization: "Bearer " + (init.token ?? apikey) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let body: unknown = text;
  try { body = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { status: response.status, body };
}
const rpc = (name: string, token: string | undefined, args: Record<string, unknown> = {}) => call("/rest/v1/rpc/" + name, { token, body: args });

function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of secret.replace(/=+$/, "").toUpperCase()) {
    const index = alphabet.indexOf(ch);
    if (index < 0) continue;
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secret: string): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hmac = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString();
  return code.padStart(6, "0");
}

async function passwordSession(): Promise<Session> {
  const reply = await call("/auth/v1/token?grant_type=password", { body: { email: env.CLOUD_STAGING_OWNER_EMAIL, password: env.CLOUD_STAGING_OWNER_PASSWORD } });
  if (reply.status !== 200) throw new Error("Owner password sign-in failed (HTTP " + reply.status + ").");
  return { token: reply.body.access_token };
}
async function upgradeToMfa(first: Session): Promise<Session> {
  const user = await call("/auth/v1/user", { method: "GET", token: first.token });
  const verified = (user.body?.factors ?? []).find((f: any) => f.factor_type === "totp" && f.status === "verified");
  let secret = readEnv().CLOUD_STAGING_OWNER_TOTP_SECRET;
  let factorId: string;
  if (verified) {
    if (!secret) throw new Error("The staging owner already has an MFA factor but CLOUD_STAGING_OWNER_TOTP_SECRET is not set. Remove the factor in the dashboard and rerun.");
    factorId = verified.id;
  } else {
    const enrolled = await call("/auth/v1/factors", { token: first.token, body: { factor_type: "totp", friendly_name: "staging-" + randomUUID().slice(0, 8) } });
    if (enrolled.status !== 200 && enrolled.status !== 201) throw new Error("MFA enrollment failed (HTTP " + enrolled.status + "). Is TOTP MFA enabled?");
    factorId = enrolled.body.id;
    secret = enrolled.body.totp.secret as string;
    appendFileSync(envFile, "\nCLOUD_STAGING_OWNER_TOTP_SECRET=" + secret + "\n");
  }
  const challenge = await call("/auth/v1/factors/" + factorId + "/challenge", { token: first.token, body: {} });
  const verify = await call("/auth/v1/factors/" + factorId + "/verify", { token: first.token, body: { challenge_id: challenge.body.id, code: totp(secret!) } });
  if (verify.status !== 200) throw new Error("MFA verification failed (HTTP " + verify.status + ").");
  return { token: verify.body.access_token };
}
async function anonymousSession(): Promise<Session> {
  const reply = await call("/auth/v1/signup", { body: {} });
  if (reply.status !== 200 || !reply.body?.access_token) throw new Error("Anonymous sign-in failed (HTTP " + reply.status + "). Is it enabled?");
  return { token: reply.body.access_token };
}

const sha = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
function batch(entities: unknown[], extra: Record<string, unknown> = {}) {
  const payload = JSON.stringify({ asOf: new Date().toISOString(), schema: 41, entities, ...extra });
  return { payload, hash: sha(payload) };
}
const entity = (type: string, id: string, date: string | null, search: string, dto: Record<string, unknown> = {}) => ({ type, id, date, search, dto: { id, ...dto } });
async function publish(token: string, generation: number, seq: number, entities: unknown[], final = false) {
  const b = batch(entities);
  return { ...(await rpc("pos_publish_batch", token, { p_generation: generation, p_seq: seq, p_hash: b.hash, p_final: final, p_payload: b.payload })), b };
}
async function connect(owner: Session, label: string) {
  const code = await rpc("pos_create_device_enrollment", owner.token);
  expect(code.status).toBe(200);
  const device = await anonymousSession();
  const claim = await rpc("pos_claim_device_enrollment", device.token, { p_code: code.body.code, p_label: label });
  expect(claim.status).toBe(200);
  return { device, code: code.body.code as string, generation: claim.body.generation as number };
}

describe.skipIf(!configured)("cloud schema: security and stream rules (staging project)", () => {
  const run = "t" + Date.now().toString(36);
  let owner: Session;
  let a: { device: Session; code: string; generation: number };

  it("refuses callers without a session or with the wrong kind of session", async () => {
    expect((await rpc("pos_owner_status", undefined)).status).toBeGreaterThanOrEqual(400);
    expect((await rpc("pos_publish_batch", undefined, { p_generation: 1, p_seq: 1, p_hash: "0".repeat(64), p_final: false, p_payload: "{}" })).status).toBeGreaterThanOrEqual(400);
    const first = await passwordSession();
    const noMfa = await rpc("pos_owner_status", first.token);
    expect(noMfa.status).toBe(403);
    expect((await rpc("pos_bootstrap_owner", first.token, { p_shop_name: "x" })).status).toBe(403);
    const stranger = await anonymousSession();
    expect((await rpc("pos_owner_status", stranger.token)).status).toBe(403);
    expect((await rpc("pos_bootstrap_owner", stranger.token, { p_shop_name: "x" })).status).toBe(403);
    expect((await rpc("pos_device_status", stranger.token)).status).toBe(403);
  });

  it("sets up the owner behind two-step verification, and repeating it is harmless", async () => {
    owner = await upgradeToMfa(await passwordSession());
    const first = await rpc("pos_bootstrap_owner", owner.token, { p_shop_name: "Staging Shop" });
    expect(first.status).toBe(200);
    const again = await rpc("pos_bootstrap_owner", owner.token, { p_shop_name: "Another" });
    expect(again.body.created).toBe(false);
    const status = await rpc("pos_owner_status", owner.token);
    expect(status.status).toBe(200);
    expect(status.body.shopName).toBeTypeOf("string");
  });

  it("connects a shop computer with a one-time code and gives wrong and reused codes the same answer", async () => {
    a = await connect(owner, "Test counter " + run);
    const stranger = await anonymousSession();
    const wrong = await rpc("pos_claim_device_enrollment", stranger.token, { p_code: "AAAAA-BBBBB-CCCCC-DDDDD", p_label: "x" });
    const reused = await rpc("pos_claim_device_enrollment", stranger.token, { p_code: a.code, p_label: "x" });
    expect(wrong.status).toBe(403);
    expect(reused.status).toBe(403);
    expect(reused.body.message).toBe(wrong.body.message);
    expect((await rpc("pos_owner_status", a.device.token)).status).toBe(403);
    expect((await rpc("pos_create_device_enrollment", a.device.token)).status).toBe(403);
    const status = await rpc("pos_device_status", a.device.token);
    expect(status.body).toMatchObject({ ok: true, generation: a.generation, publishedSeq: 0, complete: false });
  });

  it("keeps a new stream hidden until its final batch, then shows it atomically", async () => {
    const pid = run + "-p1";
    const one = await publish(a.device.token, a.generation, 1, [entity("product", pid, null, "needle widget", { name: "Needle widget" })]);
    expect(one.status).toBe(200);
    expect((await rpc("pos_owner_get", owner.token, { p_type: "product", p_id: pid })).body).toBeNull();
    const two = await publish(a.device.token, a.generation, 2, [entity("shop", "shop", null, "", { stockValuePaisa: "100" })], true);
    expect(two.body).toMatchObject({ ok: true, replay: false, seq: 2, complete: true });
    expect((await rpc("pos_owner_get", owner.token, { p_type: "product", p_id: pid })).body).toMatchObject({ id: pid });
    const status = await rpc("pos_owner_status", owner.token);
    expect(status.body.visibleGeneration).toBe(a.generation);
    expect(status.body.device.label).toContain(run);
  });

  it("treats a resend as harmless and rejects gaps, changed content and damage", async () => {
    const dup = await publish(a.device.token, a.generation, 2, [entity("shop", "shop", null, "", { stockValuePaisa: "100" })], true);
    // A different payload for a used number must be refused, never applied.
    expect(dup.status).toBe(409);
    const stored = batch([entity("product", run + "-x", null, "x")]);
    const next = await rpc("pos_publish_batch", a.device.token, { p_generation: a.generation, p_seq: 3, p_hash: stored.hash, p_final: false, p_payload: stored.payload });
    expect(next.status).toBe(200);
    const replay = await rpc("pos_publish_batch", a.device.token, { p_generation: a.generation, p_seq: 3, p_hash: stored.hash, p_final: false, p_payload: stored.payload });
    expect(replay.body).toMatchObject({ ok: true, replay: true, seq: 3 });
    expect((await publish(a.device.token, a.generation, 9, [])).status).toBe(409);
    const damaged = await rpc("pos_publish_batch", a.device.token, { p_generation: a.generation, p_seq: 4, p_hash: "f".repeat(64), p_final: false, p_payload: stored.payload });
    expect(damaged.status).toBe(400);
    expect((await publish(a.device.token, a.generation + 5, 4, [])).status).toBe(409);
    const tooMany = Array.from({ length: 501 }, (_, i) => entity("expense", run + "-m" + i, "2026-11-01", "e"));
    expect((await publish(a.device.token, a.generation, 4, tooMany)).status).toBe(400);
    const huge = "x".repeat(1048577);
    const big = await rpc("pos_publish_batch", a.device.token, { p_generation: a.generation, p_seq: 4, p_hash: sha(huge), p_final: false, p_payload: huge });
    expect(big.status).toBe(400);
    expect((await publish(a.device.token, a.generation, 4, [{ type: "bogus", id: "z", date: null, search: "", dto: {} }])).status).toBeGreaterThanOrEqual(400);
    expect((await rpc("pos_device_status", a.device.token)).body.publishedSeq).toBe(3);
  });

  it("pages every record exactly once, newest first, and searches by text", async () => {
    const days = ["2026-11-03", "2026-11-03", "2026-11-02", "2026-11-02", "2026-11-01", "2026-10-31", "2026-10-30"];
    const ids = days.map((_, i) => run + "-e" + i);
    const sent = await publish(a.device.token, a.generation, 4, days.map((d, i) => entity("expense", ids[i], d, i === 3 ? "zz-needle rent" : "tea " + i, { amountPaisa: String(i) })));
    expect(sent.status).toBe(200);
    const seen: string[] = [];
    let after: { date?: string; id?: string } = {};
    for (let page = 0; page < 10; page++) {
      const result = await rpc("pos_owner_list", owner.token, { p_type: "expense", p_limit: 3, p_after_date: after.date ?? null, p_after_id: after.id ?? null });
      expect(result.status).toBe(200);
      seen.push(...result.body.items.map((d: any) => d.id));
      if (!result.body.next) break;
      after = result.body.next;
    }
    expect(seen.filter(id => id.startsWith(run))).toHaveLength(7);
    expect(new Set(seen).size).toBe(seen.length);
    const dates = seen.map(id => days[ids.indexOf(id)]);
    expect([...dates].sort().reverse()).toEqual(dates);
    const ranged = await rpc("pos_owner_list", owner.token, { p_type: "expense", p_from: "2026-11-02", p_to: "2026-11-02" });
    expect(ranged.body.items).toHaveLength(2);
    const found = await rpc("pos_owner_list", owner.token, { p_type: "expense", p_query: "NEEDLE" });
    expect(found.body.items.map((d: any) => d.id)).toEqual([ids[3]]);
    expect((await rpc("pos_owner_list", owner.token, { p_type: "nope" })).status).toBe(400);
  });

  it("lets a newer shop computer retire the older one, and purges only superseded streams", async () => {
    const b = await connect(owner, "Replacement " + run);
    expect(b.generation).toBeGreaterThan(a.generation);
    expect((await publish(a.device.token, a.generation, 5, [])).status).toBe(403);
    const pid = run + "-b1";
    expect((await publish(b.device.token, b.generation, 1, [entity("product", pid, null, "fresh", {})], true)).status).toBe(200);
    expect((await rpc("pos_owner_get", owner.token, { p_type: "product", p_id: run + "-p1" })).body).toBeNull();
    expect((await rpc("pos_owner_get", owner.token, { p_type: "product", p_id: pid })).body).toMatchObject({ id: pid });
    let remaining = 1;
    for (let i = 0; i < 20 && remaining > 0; i++) {
      const purge = await rpc("pos_purge_old_generations", b.device.token, { p_limit: 100 });
      expect(purge.status).toBe(200);
      remaining = purge.body.remaining;
    }
    expect(remaining).toBe(0);
    expect((await rpc("pos_owner_get", owner.token, { p_type: "product", p_id: pid })).body).toMatchObject({ id: pid });
    const devices = await rpc("pos_owner_devices", owner.token);
    expect(devices.body.filter((d: any) => d.active)).toHaveLength(1);

    const restart = await rpc("pos_restart_generation", b.device.token);
    expect(restart.body.generation).toBeGreaterThan(b.generation);
    expect((await publish(b.device.token, b.generation, 2, [])).status).toBe(409);

    const active = devices.body.find((d: any) => d.active);
    const revoked = await rpc("pos_revoke_device", owner.token, { p_membership_id: active.id });
    expect(revoked.body.revoked).toBe(true);
    expect((await rpc("pos_device_status", b.device.token)).status).toBe(403);
    expect((await publish(b.device.token, restart.body.generation, 1, [])).status).toBe(403);
  });
});
