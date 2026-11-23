import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import path from "node:path";

const installer=readFileSync(path.resolve("desktop/installer.iss"),"utf8");
const build=readFileSync(path.resolve("desktop/build-test.ps1"),"utf8");
const main=readFileSync(path.resolve("desktop/main.cjs"),"utf8");
const payloadBuilder=readFileSync(path.resolve("desktop/build-payload.mjs"),"utf8");

test("TEST.21r2 has a unique AppId, version-specific install identity, and direct versioned Desktop and Start Menu shortcuts",()=>{
 assert.match(installer,/^AppId=\{\{[0-9a-f-]{36}\}$/mi);
 assert.doesNotMatch(installer,/D2F97747-843B-4FB6-8E58-61B1BDF80F9E/i);
 assert.doesNotMatch(installer,/5D4F24FC-F90D-4B04-B16A-A1533756DCC3/i);
 assert.match(installer,/^AppId=\{\{ccd98788-5456-4301-88bd-ab9310627be6\}$/mi);
 assert.match(installer,/^\s*#define AppRelease "0\.2\.0-test\.21r2"$/mi);
 assert.match(installer,/^DefaultDirName=\{localappdata\}\\Programs\\SalamTech\\ShopPOSTest\\\{#AppRelease\}$/mi);
 assert.match(installer,/^UninstallDisplayName=Shop POS TEST \{#AppRelease\}/mi);
 assert.match(installer,/^\[Icons\]\r?\nName: "\{autodesktop\}\\Shop POS TEST 0\.2\.0-test\.21r2"; Filename: "\{app\}\\Shop POS TEST\.exe"; WorkingDir: "\{app\}"/mi);
 assert.doesNotMatch(installer,/^\[Run\]|^\[(InstallDelete|UninstallDelete)\]/mi);
});

test("TEST.21r2 build refuses reused AppIds, installation directories, and Desktop shortcuts",()=>{
 assert.match(build,/This normal-launch installer identity is reserved for TEST\.21r2/);
 assert.match(build,/The isolated TEST uninstall identity already exists/);
 assert.match(build,/The isolated TEST installation directory already exists/);
 assert.match(build,/The TEST\.21r2 desktop shortcut already exists/);
 assert.match(build,/The TEST\.21r2 persistent data root already exists/);
 assert.match(build,/The existing per-user TEST parent is unavailable or redirected/);
 assert.match(build,/Only the reviewed direct TEST\.21r2 desktop and Start Menu shortcuts are allowed/);
});

test("normal TEST.21r2 startup resolves its isolated root before any data-root access",()=>{
 assert.match(payloadBuilder,/"data-root-policy\.cjs"/);
 const resolve=main.indexOf("resolveTestDataRoot(process.argv.slice(1),process.env");
 const protect=main.indexOf("protectData(dataRoot)",resolve);
 assert(resolve>=0&&protect>resolve);
 assert.match(main,/prepareNormalDataRootParent\(dataRoot\)/);
 assert.match(main,/for\(const part of \["0\.2\.0-test\.21r2"\]\)/);
 assert.match(build,/dataRootPolicy='LOCALAPPDATA_PROGRAMS_SALAMTECH_VERSIONED_TEST21R2'/);
});


test("TEST.21r2 refuses protected TEST.19 identity and creates a separate Start Menu group",()=>{
 assert.doesNotMatch(installer,/^AppId=.*2a059cbc-70e5-4bd8-a850-9a8633ddf1c7/mi);
 assert.match(build,/2a059cbc-70e5-4bd8-a850-9a8633ddf1c7/);
 assert.match(installer,/\{userprograms\}\\SalamTech\\Shop POS TEST 0\.2\.0-test\.21r2\\Shop POS TEST 0\.2\.0-test\.21r2/);
 assert.match(installer,/Only the isolated TEST\.21r2 installation path is allowed/);
 assert.match(installer,/The TEST\.21r2 installer registration already exists/);
 assert.match(installer,/The TEST\.21r2 data root already exists/);
 assert.match(build,/The TEST\.21r2 Start Menu group already exists/);
});

test("TEST.21r2 build and installer enforce the unchanged protected backup path budget before provisioning",()=>{
 assert.match(build,/b999999999'\)\.Length -gt 120/);
 assert.match(installer,/b999999999'\)\) > 120/);
 assert.match(build,/fd015647-7e03-45c9-a0fc-bc74d7fd5eb2/);
 assert.doesNotMatch(installer,/^AppId=.*fd015647-7e03-45c9-a0fc-bc74d7fd5eb2/mi);
});
