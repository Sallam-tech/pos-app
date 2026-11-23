import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const installer=readFileSync("desktop/installer-reviewed-update.iss","utf8"),builder=readFileSync("desktop/build-reviewed-update.ps1","utf8"),fresh=readFileSync("desktop/installer.iss","utf8");
test("approved update retains the exact application and data identity",()=>{
 assert.match(installer,/AppId=\{\{ccd98788-5456-4301-88bd-ab9310627be6\}/);
 assert.match(installer,/Existing TEST\.21r2 registration is required/);
 assert.match(installer,/Existing TEST\.21r2 data is required/);
 assert.match(installer,/0\.2\.0-test\.21r2-retained-17892516/);
 assert.match(installer,/178925160dc46d0fd338ed83ae9532acc9bbc8341e536dc6467efa6fc9b5c7ab/);
 assert.match(installer,/else if DirExists\(Target\) or FileExists\(Target\)/);
 assert.doesNotMatch(installer,/^\[(Run|InstallDelete|UninstallDelete)\]/mi);
 assert.match(installer,/AppMutex=Local\\ShopPOS-Disposable-Desktop-v1/);
 assert.match(installer,/SetupMutex=Local\\ShopPOS-Disposable-Installer-v1/);
});
test("update builder keeps pinned tools, source isolation and locked dependencies",()=>{
 for(const pin of ["86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6","a547b53fbee4dd4adca1a88e215270d06f7cb1e7d333ee402fb3dd677392a87a","e0f9f1dc32032650c6629f6dee41eb6d20ba140e4e3c07c25d8a24f9ba781644","5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace"])assert.ok(builder.includes(pin));
 assert.match(builder,/exact reviewed existing TEST\.21r2 database is required/);
 assert.match(builder,/No dependency installation is allowed/);
 assert.match(builder,/seal-payload\.mjs/);assert.match(builder,/verifyPayload/);
 assert.match(builder,/new workspace artifact directory is required/);
 assert.match(fresh,/installer registration already exists/);
 assert.match(fresh,/data root already exists/);
});

test("installer preparation retains the old program and verifies unchanged data before launch",()=>{const prepare=readFileSync("desktop/install-reviewed-update.ps1","utf8");assert.match(prepare,/Rename-Item -LiteralPath \$install -NewName/);assert.match(prepare,/Program\/data preservation boundary failure/);assert.match(prepare,/Nonbrowser data changed during code-only installation/);assert.match(prepare,/Full program payload verification failed/);assert.match(prepare,/Close it normally before updating/);assert.doesNotMatch(prepare,/Remove-Item|Move-Item|Stop-Process|taskkill|cmd \/c/i);});
