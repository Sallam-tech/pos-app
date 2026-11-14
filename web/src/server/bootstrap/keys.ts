import "server-only";

import { createHash, randomBytes, randomUUID, timingSafeEqual, X509Certificate } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { rejectRedirectedPath, resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import { assertLocalTlsMaterial, type LocalTlsMaterial } from "../hosting/https";
import { withBootstrapOwnership } from "./ownership";
import { withPristineBootstrapDatabase } from "./database";
import { BootstrapRejected, rejectBootstrap, windowsProtection } from "./windows";

export interface LocalKeyConfiguration {
  readonly directory: string; // Existing dedicated protected application-data parent.
  readonly database: DatabaseOptions; // Explicit existing DB; never created/adopted here.
  readonly migrationsDirectory: string;
}
export interface LocalIdentityMetadata {
  readonly installationId: string;
  readonly deviceId: string; // Random local identity, NOT TPM/hardware attestation.
  readonly createdAt: number;
  readonly certificateFingerprint: string;
  readonly productionActivation: false;
}
interface DatabaseBinding { filename: string; device: string; inode: string }
interface StoredIdentity {
  format: "POS_LOCAL_KEYS_V1"; installationId: string; deviceId: string; windowsSid: string; createdAt: number;
  database: DatabaseBinding; signingSecrets: { ADMIN: string; SALESPERSON: string };
  tls: { key: string; certificate: string; trustAnchor: string };
}
export interface PrivateLocalKeys {
  readonly metadata: LocalIdentityMetadata;
  readonly signingSecrets: Readonly<{ ADMIN: string; SALESPERSON: string }>;
  readonly tls: LocalTlsMaterial;
}
const exact = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join(",") === keys.sort().join(",");
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);

function locations(config: LocalKeyConfiguration) {
  if (!exact(config, ["directory", "database", "migrationsDirectory"]) || config.database.create === true) return rejectBootstrap();
  // Reuse the approved persistent/TEST location policy WITHOUT creating a DB.
  resolveDatabaseLocation({ directory: config.directory, filename: "bootstrap-identity.db", mode: config.database.mode, create: true });
  const filename = resolveDatabaseLocation({ ...config.database, create: false }).filename;
  const stat = lstatSync(filename, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1) || stat.ino <= BigInt(0)) return rejectBootstrap();
  return { directory: path.join(realpathSync.native(config.directory), "protected-identity"),
    binding: { filename: filename.toLowerCase(), device: String(stat.dev), inode: String(stat.ino) } };
}
function storedFile(directory: string) {
  rejectRedirectedPath(directory);
  const entries = readdirSync(directory);
  if (realpathSync.native(directory).toLowerCase() !== path.resolve(directory).toLowerCase() ||
      !entries.includes("identity.dpapi") || entries.some(name => name !== "identity.dpapi" && name !== "enrollment" && name !== "maintenance")) return rejectBootstrap();
  if (entries.includes("enrollment")) rejectRedirectedPath(path.join(directory, "enrollment"));
  if (entries.includes("maintenance")) rejectRedirectedPath(path.join(directory, "maintenance"));
  const filename = path.join(directory, "identity.dpapi"), stat = lstatSync(filename, { bigint: true });
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== BigInt(1) || stat.size < BigInt(9) || stat.size > BigInt(131072)) return rejectBootstrap();
  return stat;
}
function validate(value: unknown, sid: unknown, binding: DatabaseBinding): StoredIdentity {
  if (!exact(value, ["format", "installationId", "deviceId", "windowsSid", "createdAt", "database", "signingSecrets", "tls"]) ||
      value.format !== "POS_LOCAL_KEYS_V1" || !uuid(value.installationId) || !uuid(value.deviceId) || value.installationId === value.deviceId ||
      typeof sid !== "string" || value.windowsSid !== sid || sid === "S-1-5-18" ||
      typeof value.createdAt !== "number" || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0 ||
      !exact(value.database, ["filename", "device", "inode"]) ||
      Object.entries(binding).some(([key, v]) => (value.database as Record<string, unknown>)[key] !== v) ||
      !exact(value.signingSecrets, ["ADMIN", "SALESPERSON"]) ||
      !exact(value.tls, ["key", "certificate", "trustAnchor"])) return rejectBootstrap();
  const secrets = value.signingSecrets;
  if (typeof secrets.ADMIN !== "string" || typeof secrets.SALESPERSON !== "string" ||
      !/^[A-Za-z0-9_-]{64}$/.test(secrets.ADMIN) || !/^[A-Za-z0-9_-]{64}$/.test(secrets.SALESPERSON) ||
      timingSafeEqual(Buffer.from(secrets.ADMIN), Buffer.from(secrets.SALESPERSON))) return rejectBootstrap();
  for (const v of Object.values(value.tls)) if (typeof v !== "string" || Buffer.byteLength(v) > 16384) return rejectBootstrap();
  return value as unknown as StoredIdentity;
}
function tlsBuffers(value: StoredIdentity): LocalTlsMaterial {
  return { key: Buffer.from(value.tls.key), certificate: Buffer.from(value.tls.certificate), trustAnchor: Buffer.from(value.tls.trustAnchor) };
}
const clearTls = (tls: LocalTlsMaterial) => { tls.key.fill(0); tls.certificate.fill(0); tls.trustAnchor.fill(0); };
function metadata(value: StoredIdentity): LocalIdentityMetadata {
  return Object.freeze({ installationId: value.installationId, deviceId: value.deviceId, createdAt: value.createdAt,
    certificateFingerprint: new X509Certificate(value.tls.certificate).fingerprint256, productionActivation: false });
}

// Explicit private call ONLY. No startup/import/HTTP hook. TLS issuance and owner
// authorization are separate gates: supplied material is validated, not trusted
// as owner proof. Neither R nor B is generated or stored by this foundation.
export async function createProtectedLocalKeys(config: LocalKeyConfiguration, tls: LocalTlsMaterial): Promise<LocalIdentityMetadata> {
  try {
    const initial = locations(config);
    assertLocalTlsMaterial(tls);
    return await withBootstrapOwnership(config.database, async retainOwnership => withPristineBootstrapDatabase(config, retainOwnership, async () => {
      const current = locations(config);
      if (JSON.stringify(current) !== JSON.stringify(initial)) return rejectBootstrap();
      const sid = await windowsProtection({ operation: "context" });
      if (typeof sid !== "string" || sid === "S-1-5-18") return rejectBootstrap();
      const value: StoredIdentity = { format: "POS_LOCAL_KEYS_V1", installationId: randomUUID(), deviceId: randomUUID(),
        windowsSid: sid, createdAt: Date.now(), database: current.binding,
        signingSecrets: { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") },
        tls: { key: tls.key.toString("utf8"), certificate: tls.certificate.toString("utf8"), trustAnchor: tls.trustAnchor.toString("utf8") } };
      validate(value, sid, current.binding);
      // Exclusive new directory; never repair/reuse even an empty prior attempt.
      // No plaintext secret is written while ACLs are being established.
      mkdirSync(current.directory);
      if (await windowsProtection({ operation: "seal", directory: current.directory, payload: Buffer.from(JSON.stringify(value)).toString("base64") }) !== true) return rejectBootstrap();
      storedFile(current.directory);
      // Independent native DPAPI reopen confirms persisted encrypted material.
      return await withProtectedLocalKeys(config, async () => {});
    }));
  } catch { throw new BootstrapRejected(); }
}

// No ordinary secret-bearing result or serialization. The private trusted caller
// receives RAM material for its callback only. No production runtime calls this
// yet; persistent HTTP authentication remains disabled.
export async function withProtectedLocalKeys(
  config: LocalKeyConfiguration, consume: (keys: PrivateLocalKeys) => Promise<void>,
): Promise<LocalIdentityMetadata> {
  let bytes: Buffer | undefined, tls: LocalTlsMaterial | undefined;
  try {
    if (typeof consume !== "function") return rejectBootstrap();
    const location = locations(config), before = storedFile(location.directory);
    const opened = await windowsProtection({ operation: "open", directory: location.directory });
    if (!exact(opened, ["sid", "payload"]) || typeof opened.payload !== "string" ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(opened.payload) || opened.payload.length > 90000) return rejectBootstrap();
    bytes = Buffer.from(opened.payload, "base64");
    const value = validate(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)), opened.sid, location.binding);
    const after = storedFile(location.directory);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size ||
        before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs ||
        JSON.stringify(locations(config).binding) !== JSON.stringify(location.binding)) return rejectBootstrap();
    tls = tlsBuffers(value); assertLocalTlsMaterial(tls);
    const safe = metadata(value), privateKeys = { metadata: safe, signingSecrets: Object.freeze(value.signingSecrets), tls };
    Object.defineProperty(privateKeys, "toJSON", { value: rejectBootstrap, enumerable: false });
    Object.defineProperty(privateKeys, Symbol.for("nodejs.util.inspect.custom"), { value: () => "[ProtectedLocalKeys]", enumerable: false });
    await consume(Object.freeze(privateKeys));
    return safe;
  } catch { throw new BootstrapRejected(); }
  finally { bytes?.fill(0); if (tls) clearTls(tls); }
}

export async function inspectLocalVault(config: LocalKeyConfiguration) {
  const location = locations(config), metadata = await withProtectedLocalKeys(config, async () => {});
  const before = storedFile(location.directory), bytes = readFileSync(path.join(location.directory, "identity.dpapi"));
  try {
    const after = storedFile(location.directory);
    if (before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) return rejectBootstrap();
    return Object.freeze({ metadata, directory: location.directory,
      vaultDigest: createHash("sha256").update(bytes).digest("hex"),
      databaseFingerprint: createHash("sha256").update(JSON.stringify(location.binding)).digest("hex") });
  } finally { bytes.fill(0); }
}
