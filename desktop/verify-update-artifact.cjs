"use strict";
const fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
const {verifyPayload}=require("./payload-integrity.cjs");
const [directory,expected]=process.argv.slice(2);if(!directory||!path.isAbsolute(directory)||!/^([a-f0-9]{64})$/.test(expected??""))throw Error("Exact artifact proof required");
const manifest=path.join(directory,"resources/payload/manifest.json");if(createHash("sha256").update(fs.readFileSync(manifest)).digest("hex")!==expected)throw Error("Artifact manifest mismatch");
verifyPayload(path.join(directory,"resources"),JSON.parse(fs.readFileSync(manifest,"utf8")).electron).then(value=>{if(value.manifestSha256!==expected)throw Error("Verified manifest differs from authorized artifact");process.stdout.write(JSON.stringify(value));}).catch(()=>{process.exitCode=1;});
