import "server-only";
import { Encrypter, Decrypter, generateX25519Identity, identityToRecipient } from "age-encryption";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, sign, verify } from "node:crypto";
import { createReadStream, lstatSync } from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { inspect } from "node:util";
import { canonical } from "../inventory/validation";
import path from "node:path";
import { storage, fail, testDirectory } from "./storage";

declare const keyBrand: unique symbol;
export interface BackupCustody { readonly [keyBrand]: true }
interface Secret {
  version: "POS_TEST_BACKUP_KEYS_V1"; id: string; identity: string; recipient: string;
  signingPrivate: string | null; signingPublic: string;
}
const keys = new WeakMap<object, Secret>();
function capsule(value: Secret): BackupCustody {
  const result = Object.freeze({ toJSON: fail, [inspect.custom]: () => "[Private TEST backup custody]" }) as unknown as BackupCustody;
  keys.set(result, value); return result;
}
const secret = (custody: BackupCustody) => keys.get(custody) ?? fail();
export function custodyMetadata(custody: BackupCustody) {
  const k = secret(custody);
  return Object.freeze({ id: k.id, recipient: k.recipient, signingPublic: k.signingPublic, productionActivation: false as const });
}
export async function createTestCustody(directory: string): Promise<BackupCustody> {
  testDirectory(directory);
  await storage(directory, "initialize");
  const identity = await generateX25519Identity(), pair = generateKeyPairSync("ed25519");
  const k: Secret = { version: "POS_TEST_BACKUP_KEYS_V1", id: randomUUID(), identity, recipient: await identityToRecipient(identity),
    signingPrivate: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    signingPublic: pair.publicKey.export({ type: "spki", format: "pem" }).toString() };
  const payload = Buffer.from(JSON.stringify(k));
  try { await storage(directory, "seal", { value: payload.toString("base64") }); }
  finally { payload.fill(0); }
  return capsule(k);
}
export async function openTestCustody(directory: string): Promise<BackupCustody> {
  const encoded = await storage(directory, "unseal");
  if (typeof encoded !== "string") return fail();
  const b = Buffer.from(encoded, "base64");
  try {
    const k = JSON.parse(new TextDecoder("utf8", { fatal: true }).decode(b)) as Secret;
    if (!k || Object.keys(k).sort().join(",") !== "id,identity,recipient,signingPrivate,signingPublic,version" ||
      k.version !== "POS_TEST_BACKUP_KEYS_V1" || !/^[0-9a-f-]{36}$/.test(k.id) ||
      await identityToRecipient(k.identity) !== k.recipient ||
      createPublicKey(createPrivateKey(typeof k.signingPrivate==="string"?k.signingPrivate:fail())).export({ type: "spki", format: "pem" }).toString() !== k.signingPublic) return fail();
    return capsule(k);
  } catch { return fail(); } finally { b.fill(0); }
}
// Deliberate private TEST handoff only. A callback is not witnessed real owner custody.
// Never return a recovery identity from an HTTP API or serialize it as evidence.
export async function withTestRecoveryMaterial<T>(custody: BackupCustody, consume: (identity: string) => Promise<T>): Promise<T> {
  if (process.env.NODE_ENV !== "test" || typeof consume !== "function") return fail();
  return consume(secret(custody).identity);
}
export type SnapshotFacts = {
  format: "POS_SQLITE_SNAPSHOT_V1" | "POS_AUTH8_SNAPSHOT_V1"; archiveId: string; keyId: string; createdAtMs: string;
  schema: 8 | 41; sourceNamespace: string; databaseBytes: string; databaseSha256: string;
  fingerprint: unknown; history: unknown[];
};
const MAX_BYTES = 1024 * 1024 * 1024;
const MAX_HEADER = 65536;
// Full bounded protected enrollment history is included only in the new auth8 format.
const MAX_AUTH8_HEADER = 262144;
function safeFile(filename: string) {
  const st = lstatSync(filename);
  if (!st.isFile() || st.isSymbolicLink() || st.nlink !== 1 || st.size < 1 || st.size > MAX_BYTES + 1024 * 1024) return fail();
  return st;
}
export async function hashFile(filename: string) {
  safeFile(filename);
  const hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(filename)) { bytes += chunk.length; if (bytes > MAX_BYTES + 1024 * 1024) return fail(); hash.update(chunk); }
  return { bytes: String(bytes), sha256: hash.digest("hex") };
}
async function writeStream(filename: string, stream: ReadableStream<Uint8Array>, limit: number, signal?: AbortSignal) {
  const file = await open(filename, "wx"), reader = stream.getReader(); let count = 0;
  try {
    for (;;) {
      if (signal?.aborted) return fail();
      const { done, value } = await reader.read(); if (done) break;
      count += value.byteLength; if (count > limit) return fail();
      let offset = 0;
      while (offset < value.byteLength) {
        const wrote = await file.write(value, offset, value.byteLength - offset);
        if (!wrote.bytesWritten) return fail(); offset += wrote.bytesWritten;
      }
    }
    await file.sync();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); await file.close(); }
}
export async function encryptSnapshot(custody: BackupCustody, snapshot: string, pending: string, sourceNamespace: string, fingerprint: unknown, signal?: AbortSignal, history: unknown[] = [], archiveId: string = randomUUID(), schema: 8 | 41 = 41) {
  testDirectory(path.dirname(snapshot)); testDirectory(path.dirname(pending));
  if ((schema !== 8 && schema !== 41) || (schema === 8 && history.length !== 0)) return fail();
  const k = secret(custody), facts = await hashFile(snapshot);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(archiveId) || !/^[a-f0-9]{64}$/.test(sourceNamespace) || BigInt(facts.bytes)>BigInt(MAX_BYTES)) return fail();
  const manifest: SnapshotFacts = { format: schema === 8 ? "POS_AUTH8_SNAPSHOT_V1" : "POS_SQLITE_SNAPSHOT_V1", archiveId, keyId: k.id,
    createdAtMs: String(Date.now()), schema, sourceNamespace, databaseBytes: facts.bytes, databaseSha256: facts.sha256, fingerprint, history };
  const signature = sign(null, Buffer.from(canonical(manifest)), k.signingPrivate??fail()).toString("base64");
  const header = Buffer.from(canonical({ manifest, signature }));
  if (header.length > (schema === 8 ? MAX_AUTH8_HEADER : MAX_HEADER)) return fail();
  const length = Buffer.alloc(4); length.writeUInt32BE(header.length);
  const input = Readable.from((async function* () { yield length; yield header; for await (const chunk of createReadStream(snapshot)) yield chunk; })());
  const enc = new Encrypter(); enc.addRecipient(k.recipient);
  try {
    await writeStream(pending, await enc.encrypt(Readable.toWeb(input) as ReadableStream<Uint8Array>), MAX_BYTES + 1024 * 1024, signal);
    return Object.freeze(manifest);
  } catch { input.destroy(); return fail(); }
}
export async function decryptSnapshot(custody: BackupCustody, archive: string, pending: string, signal?: AbortSignal, testIdentity?: string, expectedArchiveSha256?:string, expectedSchema: 8 | 41 = 41): Promise<Readonly<SnapshotFacts>> {
  testDirectory(path.dirname(archive)); testDirectory(path.dirname(pending));
  if (expectedSchema !== 8 && expectedSchema !== 41) return fail();
  const maximumHeader = expectedSchema === 8 ? MAX_AUTH8_HEADER : MAX_HEADER;
  const k = secret(custody); safeFile(archive);if(expectedArchiveSha256!==undefined&&!/^[a-f0-9]{64}$/.test(expectedArchiveSha256))return fail();
  const d = new Decrypter(); d.addIdentity(testIdentity ?? k.identity);
  const file = await open(pending, "wx");
  const input = createReadStream(archive),cipherHash=createHash("sha256");let cipherBytes=0;
  const ciphertext=Readable.from((async function*(){for await(const chunk of input){cipherBytes+=chunk.length;if(cipherBytes>MAX_BYTES+1024*1024)return fail();cipherHash.update(chunk);yield chunk;}})());
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, prefix = Buffer.alloc(0), headerLength: number | undefined;
  let manifest: SnapshotFacts | undefined, bytes = 0; const hash = createHash("sha256");
  try {
    reader = (await d.decrypt(Readable.toWeb(ciphertext) as ReadableStream<Uint8Array>)).getReader();
    for (;;) {
      if (signal?.aborted) return fail();
      const item = await reader.read(); if (item.done) break;
      let chunk = Buffer.from(item.value);
      if (!manifest) {
        prefix = Buffer.concat([prefix, chunk]); chunk = Buffer.alloc(0);
        if (prefix.length >= 4 && headerLength === undefined) {
          headerLength = prefix.readUInt32BE(); if (!headerLength || headerLength > maximumHeader) return fail();
        }
        if (headerLength !== undefined && prefix.length >= headerLength + 4) {
          const encoded = prefix.subarray(4, 4 + headerLength).toString("utf8");
          const envelope = JSON.parse(encoded);
          if (canonical(envelope) !== encoded || Object.keys(envelope).sort().join(",") !== "manifest,signature" ||
            typeof envelope.signature !== "string" || !verify(null, Buffer.from(canonical(envelope.manifest)), k.signingPublic, Buffer.from(envelope.signature, "base64"))) return fail();
          manifest = envelope.manifest;
          if (!manifest || Object.keys(manifest).sort().join(",") !== "archiveId,createdAtMs,databaseBytes,databaseSha256,fingerprint,format,history,keyId,schema,sourceNamespace" ||
            !Array.isArray(manifest.history) || manifest.history.length > 16 || manifest.format !== (expectedSchema === 8 ? "POS_AUTH8_SNAPSHOT_V1" : "POS_SQLITE_SNAPSHOT_V1") || manifest.schema !== expectedSchema || (expectedSchema === 8 && manifest.history.length !== 0) || manifest.keyId !== k.id ||
            !/^[0-9a-f-]{36}$/.test(manifest.archiveId) || !/^[0-9]{1,16}$/.test(manifest.createdAtMs) ||
            !/^[a-f0-9]{64}$/.test(manifest.sourceNamespace) || !/^[a-f0-9]{64}$/.test(manifest.databaseSha256) ||
            !/^[1-9][0-9]{0,10}$/.test(manifest.databaseBytes) || BigInt(manifest.databaseBytes) > BigInt(MAX_BYTES)) return fail();
          chunk = prefix.subarray(4 + headerLength); prefix = Buffer.alloc(0);
        } else if (prefix.length > maximumHeader + 4 + 65536) return fail();
      }
      if (manifest && chunk.length) {
        bytes += chunk.length;
        if (bytes > Number(manifest.databaseBytes) || bytes > MAX_BYTES) return fail();
        hash.update(chunk);
        let offset = 0;
        while (offset < chunk.length) { const wrote = await file.write(chunk, offset, chunk.length - offset); if (!wrote.bytesWritten) return fail(); offset += wrote.bytesWritten; }
      }
    }
    // Full authenticated EOF is required. Early plaintext is always unpublished.
    if (!manifest || String(bytes) !== manifest.databaseBytes || hash.digest("hex") !== manifest.databaseSha256) return fail();
    const actualArchiveSha256=cipherHash.digest("hex");if(expectedArchiveSha256!==undefined&&actualArchiveSha256!==expectedArchiveSha256)return fail();
    await file.sync(); return Object.freeze(manifest);
  } catch { return fail(); }
  finally { input.destroy(); ciphertext.destroy(); await reader?.cancel().catch(() => {}); reader?.releaseLock(); await file.close(); }
}

export function signProtectedEvidence(custody:BackupCustody,value:unknown){return sign(null,Buffer.from(canonical(value)),(secret(custody).signingPrivate??fail())).toString("base64");}
export function verifyProtectedEvidence(custody:BackupCustody,value:unknown,signature:unknown){try{return typeof signature==="string"&&verify(null,Buffer.from(canonical(value)),secret(custody).signingPublic,Buffer.from(signature,"base64"));}catch{return false;}}

export async function importTestPortableRecovery(identity:string,trust:Readonly<{id:string;signingPublic:string}>):Promise<BackupCustody>{
 if(process.env.NODE_ENV!=="test"||typeof identity!=="string"||typeof trust?.id!=="string"||!/^([a-f0-9-]{36})$/.test(trust.id)||typeof trust.signingPublic!=="string"||trust.signingPublic.length>8192)return fail();
 try{if(createPublicKey(trust.signingPublic).asymmetricKeyType!=="ed25519")return fail();
 return capsule({version:"POS_TEST_BACKUP_KEYS_V1",id:trust.id,identity,recipient:await identityToRecipient(identity),signingPrivate:null,signingPublic:trust.signingPublic});
 }catch{return fail();}
}
