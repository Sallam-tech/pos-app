import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {resolveDisposableTestDataRoot,resolveTestDataRoot}=require("../data-root-policy.cjs");
const root=path.win32.resolve("D:/pos/web/test-results/posdt-11111111-1111-4111-8111-111111111111");
const localAppData="C:\\Users\\Owner\\AppData\\Local";
const appDataPath="C:\\Users\\Owner\\AppData\\Roaming";
const executablePath=path.win32.join(localAppData,"Programs","SalamTech","ShopPOSTest","0.2.0-test.21r2","Shop POS TEST.exe");
const identity={version:"0.2.0-test.21r2",executablePath,appDataPath};

test("the TEST.21r2 normal launch uses its own versioned protected data root",()=>{
 const resolved=resolveTestDataRoot([], {LOCALAPPDATA:localAppData}, identity);
 assert.equal(resolved,path.win32.join(localAppData,"Programs","SalamTech","0.2.0-test.21r2","ShopPOSTestData"));
 assert.notEqual(resolved,path.win32.join(localAppData,"ShopPOSTestData"));
});

test("normal launch refuses a harness-provided data-root override",()=>{
 assert.throws(()=>resolveTestDataRoot([], {LOCALAPPDATA:localAppData,SHOP_POS_DESKTOP_TEST_DATA:root}, identity));
});

test("normal launch requires the exact TEST.21r2 version and installed executable",()=>{
 assert.throws(()=>resolveTestDataRoot([], {LOCALAPPDATA:localAppData}, {...identity,version:"0.2.0-test.18"}));
 assert.throws(()=>resolveTestDataRoot([], {LOCALAPPDATA:localAppData}, {...identity,executablePath:"C:\\Temp\\Shop POS TEST.exe"}));
});

test("normal launch refuses unexpected arguments and profile redirection",()=>{
 assert.throws(()=>resolveTestDataRoot(["--disposable-harness"], {LOCALAPPDATA:localAppData}, identity));
 assert.throws(()=>resolveTestDataRoot(["--unknown"], {LOCALAPPDATA:localAppData}, identity));
 assert.throws(()=>resolveTestDataRoot([], {LOCALAPPDATA:"D:\\Different\\Local"}, identity));
});

test("the disposable harness still requires its explicit data-root environment",()=>{
 assert.throws(()=>resolveTestDataRoot(["--disposable-harness"], {}, identity));
});

test("the protected default data-root name is rejected for harness overrides",()=>{
 assert.throws(()=>resolveDisposableTestDataRoot(["--disposable-harness"], {
  SHOP_POS_DESKTOP_TEST_DATA:"C:\\Users\\Owner\\AppData\\Local\\ShopPOSTestData"
 }));
});

test("the disposable root must be absolute",()=>{
 assert.throws(()=>resolveDisposableTestDataRoot(["--disposable-harness"], {
  SHOP_POS_DESKTOP_TEST_DATA:"posdt-11111111-1111-4111-8111-111111111111"
 }));
});

test("the existing native harness's absolute posdt UUID root is accepted for TEST.21r2",()=>{
 assert.equal(resolveTestDataRoot(
  ["--disposable-harness","--force-renderer-accessibility"],
  {SHOP_POS_DESKTOP_TEST_DATA:root},
  identity
 ),root);
});


test("TEST.21r2 refuses every protected TEST.17/18/19/20 application identity and installation path",()=>{
 for(const n of [17,18,19,20]){
  const version="0.2.0-test."+n;
  const old=path.win32.join(localAppData,"Programs","SalamTech","ShopPOSTest",version,"Shop POS TEST.exe");
  assert.throws(()=>resolveTestDataRoot([],{LOCALAPPDATA:localAppData},{...identity,version,executablePath:old}));
  assert.throws(()=>resolveTestDataRoot([],{LOCALAPPDATA:localAppData},{...identity,executablePath:old}));
 }
});

test("normal TEST.21r2 paths satisfy the actual unchanged worker guard including the longest selected generation",async()=>{
 const {readFileSync}=await import("node:fs"),{runInNewContext}=await import("node:vm");
 const source=readFileSync(new URL("../../web/src/server/backup/worker.ts",import.meta.url),"utf8");
 const guard=source.match(/function protectedStoragePaths\(root:string,exportDirectory:string\)\{[^\n]+\}/)?.[0];assert.ok(guard);
 const check=runInNewContext(guard.replaceAll(":string","")+";protectedStoragePaths",{path:path.win32,fail(){throw Error("Rejected");}});
 const resolved=resolveTestDataRoot([],{LOCALAPPDATA:localAppData},identity),base=path.win32.join(resolved,"test-results","sqlite-b1b-part1");
 assert.doesNotThrow(()=>check(path.win32.join(base,"b999999999"),path.win32.join(base,"e999999999")));
 const oldBase=path.win32.join(localAppData,"Programs","SalamTech","ShopPOSTestData","0.2.0-test.20","ShopPOSTestData","test-results","sqlite-b1b-part1");
 assert.throws(()=>check(path.win32.join(oldBase,"b"),path.win32.join(oldBase,"e")));
});

test("a profile exceeding the protected backup budget is rejected before any data provisioning",()=>{
 const user="LongWindowsProfileName",base=path.win32.join("C:/Users",user,"AppData");
 const local=path.win32.join(base,"Local"),id={version:identity.version,appDataPath:path.win32.join(base,"Roaming"),executablePath:path.win32.join(local,"Programs","SalamTech","ShopPOSTest",identity.version,"Shop POS TEST.exe")};
 assert.throws(()=>resolveTestDataRoot([],{LOCALAPPDATA:local},id),/backup path budget/);
});
