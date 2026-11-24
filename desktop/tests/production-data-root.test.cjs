"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {resolveProductionDataRoot}=require("../production-data-root.cjs");
const local="C:\\Users\\owner\\AppData\\Local";
const environment={LOCALAPPDATA:local};
const identity={version:"1.0.0",appDataPath:"C:\\Users\\owner\\AppData\\Roaming",executablePath:local+"\\Programs\\SalamTech\\ShopPOS\\1.0.0\\Shop POS.exe"};
test("installed production identity resolves only its own durable data root",()=>{
 assert.equal(resolveProductionDataRoot([],environment,identity),local+"\\Programs\\SalamTech\\ShopPOSData\\1.0.0");
});
test("TEST installation, harness and selected database cannot enter production",()=>{
 for(const [args,env,id] of [
  [["--disposable-harness"],environment,identity],
  [[],{...environment,SHOP_POS_DESKTOP_TEST_DATA:"C:\\temp"},identity],
  [[],{...environment,SHOP_POS_PRODUCTION_DATA:"C:\\temp"},identity],
  [[],environment,{...identity,version:"0.2.0-test.21r2"}],
  [[],environment,{...identity,executablePath:local+"\\Programs\\SalamTech\\ShopPOSTest\\0.2.0-test.21r2\\Shop POS TEST.exe"}],
  [[],environment,{...identity,appDataPath:"C:\\Users\\other\\AppData\\Roaming"}],
 ])assert.throws(()=>resolveProductionDataRoot(args,env,id));
});
