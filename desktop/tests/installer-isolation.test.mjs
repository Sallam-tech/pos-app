import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";

const installer=readFileSync(path.resolve("desktop/installer.iss"),"utf8");
const build=readFileSync(path.resolve("desktop/build-test.ps1"),"utf8");
const main=readFileSync(path.resolve("desktop/main.cjs"),"utf8");
const payloadBuilder=readFileSync(path.resolve("desktop/build-payload.mjs"),"utf8");

test("TEST.19 has a unique AppId, version-specific install identity, and one direct Desktop shortcut",()=>{
 assert.match(installer,/^AppId=\{\{[0-9a-f-]{36}\}$/mi);
 assert.doesNotMatch(installer,/D2F97747-843B-4FB6-8E58-61B1BDF80F9E/i);
 assert.doesNotMatch(installer,/5D4F24FC-F90D-4B04-B16A-A1533756DCC3/i);
 assert.match(installer,/^AppId=\{\{2a059cbc-70e5-4bd8-a850-9a8633ddf1c7\}$/mi);
 assert.match(installer,/^\s*#define AppRelease "0\.2\.0-test\.19"$/mi);
 assert.match(installer,/^DefaultDirName=\{localappdata\}\\Programs\\SalamTech\\ShopPOSTest\\\{#AppRelease\}$/mi);
 assert.match(installer,/^UninstallDisplayName=Shop POS TEST \{#AppRelease\}/mi);
 assert.match(installer,/^\[Icons\]\r?\nName: "\{autodesktop\}\\Shop POS TEST 0\.2\.0-test\.19"; Filename: "\{app\}\\Shop POS TEST\.exe"; WorkingDir: "\{app\}"$/mi);
 assert.doesNotMatch(installer,/^\[Run\]|^\[(InstallDelete|UninstallDelete)\]/mi);
});

test("TEST.19 build refuses reused AppIds, installation directories, and Desktop shortcuts",()=>{
 assert.match(build,/This normal-launch installer identity is reserved for TEST\.19/);
 assert.match(build,/The isolated TEST uninstall identity already exists/);
 assert.match(build,/The isolated TEST installation directory already exists/);
 assert.match(build,/The TEST\.19 desktop shortcut already exists/);
 assert.match(build,/The TEST\.19 persistent data root already exists/);
 assert.match(build,/The existing per-user TEST parent is unavailable or redirected/);
 assert.match(build,/Only the reviewed direct TEST\.19 desktop shortcut is allowed/);
});

test("normal TEST.19 startup resolves its isolated root before any data-root access",()=>{
 assert.match(payloadBuilder,/"data-root-policy\.cjs"/);
 const resolve=main.indexOf("resolveTestDataRoot(process.argv.slice(1),process.env");
 const protect=main.indexOf("protectData(dataRoot)",resolve);
 assert(resolve>=0&&protect>resolve);
 assert.match(main,/prepareNormalDataRootParent\(dataRoot\)/);
 assert.match(main,/for\(const part of \["ShopPOSTestData","0\.2\.0-test\.19"\]\)/);
 assert.match(build,/dataRootPolicy='LOCALAPPDATA_PROGRAMS_SALAMTECH_VERSIONED_TEST19'/);
});
