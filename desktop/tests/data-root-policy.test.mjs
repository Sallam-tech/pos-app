import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
const {resolveDisposableTestDataRoot,resolveTestDataRoot}=require("../data-root-policy.cjs");
const root=path.win32.resolve("D:/pos/web/test-results/posdt-11111111-1111-4111-8111-111111111111");
const localAppData="C:\\Users\\Owner\\AppData\\Local";
const appDataPath="C:\\Users\\Owner\\AppData\\Roaming";
const executablePath=path.win32.join(localAppData,"Programs","SalamTech","ShopPOSTest","0.2.0-test.19","Shop POS TEST.exe");
const identity={version:"0.2.0-test.19",executablePath,appDataPath};

test("the TEST.19 normal launch uses its own versioned protected data root",()=>{
 const resolved=resolveTestDataRoot([], {LOCALAPPDATA:localAppData}, identity);
 assert.equal(resolved,path.win32.join(localAppData,"Programs","SalamTech","ShopPOSTestData","0.2.0-test.19","ShopPOSTestData"));
 assert.notEqual(resolved,path.win32.join(localAppData,"ShopPOSTestData"));
});

test("normal launch refuses a harness-provided data-root override",()=>{
 assert.throws(()=>resolveTestDataRoot([], {LOCALAPPDATA:localAppData,SHOP_POS_DESKTOP_TEST_DATA:root}, identity));
});

test("normal launch requires the exact TEST.19 version and installed executable",()=>{
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

test("the existing native harness's absolute posdt UUID root is accepted for TEST.19",()=>{
 assert.equal(resolveTestDataRoot(
  ["--disposable-harness","--force-renderer-accessibility"],
  {SHOP_POS_DESKTOP_TEST_DATA:root},
  identity
 ),root);
});
