// Pinned Next16 Windows cross-volume manifest-path correction. No auth or data paths change.
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {fileURLToPath} from "node:url";
import path from "node:path";
export const originalSha256="6e88909558245f1e1e95d97de869a9210f58995e4e19fdba62c25adf8e43d826";
export const patchedSha256="cf6ca8cf51e8c8b3de259c2b0edc2c85d523c33bbe36df4d52c1809e811d61e6";
export function correctedManifestSource(source){
 if(createHash("sha256").update(source).digest("hex")!==originalSha256)throw Error("Unreviewed Next manifest loader; correction refused.");
 const before="const manifestPath = (0, _path.join)(/* turbopackIgnore: true */ projectDir, distDir, manifest);";
 if(source.split(before).length!==3)throw Error("Pinned two manifest call sites required.");
 return source.replaceAll(before,before.replace("_path.join","_path.resolve"));
}
export function patchNextWindowsManifests(payload){
 const directory=path.join(payload,"node_modules/next");
 if(JSON.parse(readFileSync(path.join(directory,"package.json"),"utf8")).version!=="16.4.6")throw Error("Pinned Next version required.");
 const file=path.join(directory,"dist/server/load-manifest.external.js"),original=readFileSync(file,"utf8"),already=createHash("sha256").update(original).digest("hex")===patchedSha256,corrected=already?original:correctedManifestSource(original);
 if(createHash("sha256").update(corrected).digest("hex")!==patchedSha256)throw Error("Unreviewed corrected Next bytes rejected.");
 writeFileSync(file,corrected);
 const evidence={format:"SHOP_POS_PINNED_NEXT_WINDOWS_MANIFEST_CORRECTION_V1",next:"16.4.6",file:"node_modules/next/dist/server/load-manifest.external.js",beforeSha256:originalSha256,afterSha256:createHash("sha256").update(corrected).digest("hex"),changedCallSites:2,operation:already?"VERIFIED_ALREADY_PATCHED":"APPLIED_REVIEWED_PATCH",reason:"Resolve absolute build directory across Windows volumes; retain original manifest parse/cache/error semantics.",productionActivation:false};
 writeFileSync(path.join(payload,"next-windows-manifest-correction.json"),JSON.stringify(evidence,null,2));return evidence;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(patchNextWindowsManifests(path.resolve(process.argv[2]))));
