import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";

const installer=readFileSync(path.resolve("desktop/installer-shop.iss"),"utf8");
const build=readFileSync(path.resolve("desktop/build-shop.ps1"),"utf8");
const main=readFileSync(path.resolve("desktop/main.cjs"),"utf8");
const testInstaller=readFileSync(path.resolve("desktop/installer.iss"),"utf8");

test("Shop POS 1.0.0 has its own install identity and does not launch or delete data",()=>{
 assert.match(installer,/^AppId=\{\{42df49bf-db87-4125-8b4c-98232d8761ce\}$/mi);
 assert.doesNotMatch(installer,/ccd98788-5456-4301-88bd-ab9310627be6/i);
 assert.doesNotMatch(installer,/8d8f4234-248f-42b4-a35e-e487166eaf35/i);
 assert.match(installer,/^DefaultDirName=\{localappdata\}\\Programs\\SalamTech\\ShopPOS\\\{#AppRelease\}$/mi);
 assert.match(installer,/OutputBaseFilename=ShopPOS-\{#AppRelease\}-win-x64-setup/);
 assert.match(installer,/ShopPOSData\\1\.0\.0\\test-results\\sqlite-b1b-part1\\b999999999'\)\) > 120/);
 assert.doesNotMatch(installer,/^\[Run\]|^\[(InstallDelete|UninstallDelete)\]/mi);
 assert.doesNotMatch(testInstaller,/42df49bf-db87-4125-8b4c-98232d8761ce/i);
});

test("the shop builder stays on the reviewed runtime pins and Shop POS 1.0.0",()=>{
 for(const pin of ["86fc4785327db5f5c7558dc6156c543b433c313e813a222e088086222ab4afa6","a547b53fbee4dd4adca1a88e215270d06f7cb1e7d333ee402fb3dd677392a87a","e0f9f1dc32032650c6629f6dee41eb6d20ba140e4e3c07c25d8a24f9ba781644","5888dbb9a1d2b18f2c3e6c5f6af1b39de658372b402a0577b002777f14c62ace"])assert.ok(build.includes(pin));
 assert.match(build,/This installer identity is reserved for Shop POS 1\.0\.0/);
 assert.match(build,/productionActivation=\$false/);
 assert.match(build,/probe-shop-cloud\.mjs/);
 assert.match(build,/service-role key must stay empty/);
 assert.match(build,/codeSigned=\$false/);
 assert.match(main,/shopMode=installation\.mode==="production"/);
 assert.match(main,/shop-setup\.html/);
});
