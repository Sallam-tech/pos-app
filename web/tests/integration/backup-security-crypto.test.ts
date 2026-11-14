import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, test, expect } from "vitest";
import { createHash,generateKeyPairSync,sign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { ready, seed } from "../helpers/admin-products-settings-ready";
import { openProofDatabase, fingerprint, verifySchema41 } from "../helpers/backup-security-proof";
import { createTestCustody, openTestCustody, custodyMetadata, encryptSnapshot, decryptSnapshot, withTestRecoveryMaterial,importTestPortableRecovery,signProtectedEvidence } from "../../src/server/backup/crypto";
import { storage } from "../../src/server/backup/storage";
import { canonical } from "../../src/server/inventory/validation";
import { generateX25519Identity,Encrypter } from "age-encryption";
beforeAll(seed);
test("real age archive, NTFS ACL and DPAPI reopen restore every TEST41 row; two independent supplied key copies decrypt", async () => {
  const f = await ready();
  const source = path.join(f.config.database.directory, f.config.database.filename);
  const root = path.dirname(f.config.database.directory);
  const vault = mkdtempSync(path.join(root, "backup-vault-")), directory = mkdtempSync(path.join(root, "backup-files-"));
  const custody = await createTestCustody(vault), reopened = await openTestCustody(vault);
  const metadata = custodyMetadata(custody);
  expect(custodyMetadata(reopened)).toEqual(metadata);
  expect(() => JSON.stringify(custody)).toThrow();
  expect(readFileSync(path.join(vault, "custody.dpapi")).includes(Buffer.from("AGE-SECRET"))).toBe(false);
  await storage(directory, "initialize");
  const snapshot = path.join(directory, "snapshot.sqlite3"), pending = path.join(directory, "archive.pending");
  const raw = openProofDatabase(source);
  try {
    raw.exec("BEGIN"); const original = fingerprint(raw); await raw.backup(snapshot); raw.exec("ROLLBACK");
    const st = statSync(source, { bigint: true });
    const namespace = createHash("sha256").update(JSON.stringify(["pos-test-inventory-file-v1", source.toLowerCase(), String(st.dev), String(st.ino)])).digest("hex");
    const manifest = await encryptSnapshot(custody, snapshot, pending, namespace, original);
    expect(manifest.databaseBytes).toBe(String(statSync(snapshot).size));
    const first = path.join(directory, "first.sqlite3"), second = path.join(directory, "second.sqlite3");
    await decryptSnapshot(reopened, pending, first);
    await withTestRecoveryMaterial(custody, async identity => { await decryptSnapshot(reopened, pending, second, undefined, identity); });
    for (const copy of [first, second]) {
      const db = openProofDatabase(copy);
      try { db.exec("BEGIN"); await verifySchema41(db); expect(fingerprint(db)).toEqual(original); db.exec("ROLLBACK"); }
      finally { db.close(); }
    }
    await storage(directory, "publish", { source: "archive.pending", target: "verified.age" });
    await storage(directory, "check", { filename: "verified.age" });
    expect(existsSync(pending)).toBe(false);
    const archive = path.join(directory, "verified.age"), originalBytes = readFileSync(archive);
    await expect(storage(directory, "publish", { source: "missing.pending", target: "verified.age" })).rejects.toThrow();
    expect(readFileSync(archive)).toEqual(originalBytes);
    await withTestRecoveryMaterial(custody,async identity=>{
      const portable=await importTestPortableRecovery(identity,metadata);
      expect(()=>signProtectedEvidence(portable,{purpose:"forbidden signing"})).toThrow();
      const childDirectory=mkdtempSync(path.join(root,"portable-child-"));
      const reply=await new Promise<string>((resolve,reject)=>{
        const child=spawn(process.execPath,["--experimental-transform-types",fileURLToPath(new URL("../helpers/backup-security-portable-child.mjs",import.meta.url))],{cwd:process.cwd(),env:{...process.env,NODE_ENV:"test"},windowsHide:true,stdio:["pipe","pipe","pipe"]});
        const output:Buffer[]=[];let size=0;const timer=setTimeout(()=>{child.kill();reject(Error("TEST portable child timeout"));},120000);timer.unref();
        child.stdout.on("data",(b:Buffer)=>{size+=b.length;if(size>65536){child.kill();reject(Error("TEST portable child output bound"));}else output.push(b);});
        child.stderr.on("data",()=>{});child.once("error",e=>{clearTimeout(timer);reject(e);});child.once("close",code=>{clearTimeout(timer);if(code!==0)reject(Error("TEST portable child denied"));else resolve(Buffer.concat(output).toString("utf8"));});
        const input=Buffer.from(JSON.stringify({identity,trust:{id:metadata.id,signingPublic:metadata.signingPublic},archive,directory:childDirectory}));child.stdin.end(input,()=>input.fill(0));
      });
      const result=JSON.parse(reply);expect(result.state).toBe("READ_ONLY_PORTABLE_TEST_VERIFIED");expect(result.fingerprint).toEqual(original);expect(result.physicalHardware).toBe("NOT_VERIFIED");
    });
    writeFileSync(path.resolve("test-results/backup-security-preflight-20261114/crypto-proof.json"), JSON.stringify({
      status: "PASS_CRYPTO_PRIMITIVES_ONLY", schema: 41, format: "age-v1", keyProtection: "Windows_CurrentUser_DPAPI",
      storage: "restricted_NTFS", snapshotRowsMatched: true, ownerKeyCopies: "RAM_TEST_INPUTS_ONLY",
      applicationRestore: "SEPARATE_PROVENANCE_DRILL", physicalReplacementPc: "NOT_VERIFIED", productionActivation: false,
    }, null, 2));
  } finally { raw.close(); await f.g.close(); }
});
test("wrong/missing keys, wrong signer, ciphertext damage, truncation and cancellation never publish restored output", async () => {
  const f = await ready(), root = path.dirname(f.config.database.directory);
  const vault = mkdtempSync(path.join(root, "negative-vault-")), otherVault = mkdtempSync(path.join(root, "negative-other-"));
  const directory = mkdtempSync(path.join(root, "negative-files-"));
  const custody = await createTestCustody(vault), other = await createTestCustody(otherVault);
  await storage(directory, "initialize");
  const snapshot = path.join(directory, "snapshot.sqlite3"), archive = path.join(directory, "archive.pending");
  const raw = openProofDatabase(path.join(f.config.database.directory, f.config.database.filename));
  try {
    await raw.backup(snapshot);
    await encryptSnapshot(custody, snapshot, archive, "a".repeat(64), fingerprint(raw));
    await expect(decryptSnapshot(other, archive, path.join(directory, "wrong-key.sqlite3"))).rejects.toThrow();
    await expect(decryptSnapshot(custody, archive, path.join(directory, "missing-key.sqlite3"), undefined, await generateX25519Identity())).rejects.toThrow();
    await withTestRecoveryMaterial(custody, async identity => {
      await expect(decryptSnapshot(other, archive, path.join(directory, "wrong-signer.sqlite3"), undefined, identity)).rejects.toThrow();
    });
    const changed = Buffer.from(readFileSync(archive)); changed[changed.length - 1] ^= 1;
    writeFileSync(path.join(directory, "changed.pending"), changed);
    await expect(decryptSnapshot(custody, path.join(directory, "changed.pending"), path.join(directory, "changed.sqlite3"))).rejects.toThrow();
    writeFileSync(path.join(directory, "truncated.pending"), readFileSync(archive).subarray(0, -1));
    await expect(decryptSnapshot(custody, path.join(directory, "truncated.pending"), path.join(directory, "truncated.sqlite3"))).rejects.toThrow();
    const cancel = new AbortController(); cancel.abort();
    await expect(decryptSnapshot(custody, archive, path.join(directory, "cancelled.sqlite3"), cancel.signal)).rejects.toThrow();
    expect(existsSync(path.join(directory, "verified.age"))).toBe(false);
    await expect(decryptSnapshot(custody, archive, snapshot)).rejects.toThrow();
    const valid = openProofDatabase(snapshot);
    try { await verifySchema41(valid); } finally { valid.close(); }
    await expect(storage(directory, "check", { filename: "../custody.dpapi" })).rejects.toThrow();
  } finally { raw.close(); await f.g.close(); }
});

test("the public recipient cannot forge source authentication with the correct key ID and fully valid age ciphertext",async()=>{
 const f=await ready(),root=path.dirname(f.config.database.directory),directory=mkdtempSync(path.join(root,"signer-forgery-")),custody=await createTestCustody(mkdtempSync(path.join(root,"signer-vault-")));
 try{
  await storage(directory,"initialize");const snapshot=path.join(directory,"snapshot.sqlite3"),raw=openProofDatabase(path.join(f.config.database.directory,f.config.database.filename));let proof;
  try{await raw.backup(snapshot);proof=fingerprint(raw);}finally{raw.close();}
  const valid=path.join(directory,"valid.pending"),manifest=await encryptSnapshot(custody,snapshot,valid,"b".repeat(64),proof);
  await decryptSnapshot(custody,valid,path.join(directory,"genuine.sqlite3"));
  const metadata=custodyMetadata(custody),attacker=generateKeyPairSync("ed25519"),signature=sign(null,Buffer.from(canonical(manifest)),attacker.privateKey).toString("base64");
  const header=Buffer.from(canonical({manifest,signature})),length=Buffer.alloc(4);length.writeUInt32BE(header.length);
  const payload=Buffer.concat([length,header,readFileSync(snapshot)]),enc=new Encrypter();enc.addRecipient(metadata.recipient);
  const stream=await enc.encrypt(new ReadableStream<Uint8Array>({start(controller){controller.enqueue(payload);controller.close();}})),reader=stream.getReader(),chunks:Uint8Array[]=[];
  try{for(;;){const next=await reader.read();if(next.done)break;chunks.push(next.value);}}finally{reader.releaseLock();}
  const forged=path.join(directory,"forged.pending");writeFileSync(forged,Buffer.concat(chunks));
  // Same B/recipient, key ID, every manifest field, SQLite bytes/hash and valid age tag.
  // Only the signing key is wrong: this rejects public-recipient archive injection.
  expect(manifest.keyId).toBe(metadata.id);
  const output=path.join(directory,"forged.sqlite3");await expect(decryptSnapshot(custody,forged,output)).rejects.toThrow();
  expect(statSync(output).size).toBe(0);expect(existsSync(path.join(directory,"verified.age"))).toBe(false);
 }finally{await f.g.close();}
},180000);
