"use strict";
const path=require("node:path");
const {release:productionRelease,resolveProductionDataRoot}=require("./production-data-root.cjs");

const normalRelease="0.2.0-test.21r2";
const evaluationRelease="0.2.0-eval.3";

function resolveDisposableTestDataRoot(arguments_,environment){
 if(!Array.isArray(arguments_)||!arguments_.includes("--disposable-harness"))throw Error("Disposable TEST launch context required.");
 const override=environment?.SHOP_POS_DESKTOP_TEST_DATA;
 if(typeof override!=="string"||!override||!path.isAbsolute(override))throw Error("Isolated TEST data root required.");
 const dataRoot=path.resolve(override);
 if(!/^posdt-[a-f0-9-]{36}$/.test(path.basename(dataRoot)))throw Error("Isolated TEST data root required.");
 return dataRoot;
}

function sameWindowsPath(left,right){
 return path.win32.resolve(left).toLowerCase()===path.win32.resolve(right).toLowerCase();
}

function resolveTestDataRoot(arguments_,environment,identity){
 if(!Array.isArray(arguments_)||!identity||identity.version!==normalRelease)throw Error("TEST application identity required.");
 const allowed=new Set(["--disposable-harness","--force-renderer-accessibility"]);
 if(arguments_.some(argument=>!allowed.has(argument))||arguments_.includes("--force-renderer-accessibility")&&!arguments_.includes("--disposable-harness"))throw Error("TEST launch arguments denied.");
 if(arguments_.includes("--disposable-harness"))return resolveDisposableTestDataRoot(arguments_,environment);
 if(arguments_.length||environment?.SHOP_POS_DESKTOP_TEST_DATA!==undefined)throw Error("Normal TEST launch context required.");
 if(typeof environment?.LOCALAPPDATA!=="string"||!environment.LOCALAPPDATA||typeof identity.appDataPath!=="string"||typeof identity.executablePath!=="string")throw Error("Windows TEST installation identity required.");

 const appData=path.win32.resolve(identity.appDataPath),appDataParent=path.win32.dirname(appData);
 const localAppData=path.win32.resolve(environment.LOCALAPPDATA);
 if(path.win32.basename(appData).toLowerCase()!=="roaming"||path.win32.basename(appDataParent).toLowerCase()!=="appdata"||!sameWindowsPath(localAppData,path.win32.join(appDataParent,"Local")))throw Error("Windows TEST user profile identity required.");

 const releaseDirectory=path.win32.join(localAppData,"Programs","SalamTech","ShopPOSTest",normalRelease);
 const expectedExecutable=path.win32.join(releaseDirectory,"Shop POS TEST.exe");
 if(!sameWindowsPath(identity.executablePath,expectedExecutable))throw Error("Installed TEST application identity required.");

 const dataRoot=path.win32.join(localAppData,"Programs","SalamTech",normalRelease,"ShopPOSTestData");
 // Preserve the worker bounds, including its longest supported selected generation.
 if(path.win32.join(dataRoot,"test-results","sqlite-b1b-part1","b999999999").length>120||path.win32.join(dataRoot,"test-results","sqlite-b1b-part1","e999999999").length>200)throw Error("Protected TEST backup path budget exceeded.");
 return dataRoot;
}

function resolveInstalledDataRoot(arguments_,environment,identity){
 if(identity?.version===productionRelease)return Object.freeze({mode:"production",dataRoot:resolveProductionDataRoot(arguments_,environment,identity)});
 if(identity?.version===evaluationRelease){
  if(!Array.isArray(arguments_)||arguments_.length||environment?.SHOP_POS_DESKTOP_TEST_DATA!==undefined)throw Error("Normal evaluation launch context required.");
  const local=environment?.LOCALAPPDATA,roaming=identity?.appDataPath,exe=identity?.executablePath;
  if(typeof local!=="string"||typeof roaming!=="string"||typeof exe!=="string"||!sameWindowsPath(path.win32.join(path.win32.dirname(roaming),"Local"),local)||path.win32.basename(roaming).toLowerCase()!=="roaming")throw Error("Windows evaluation user profile required.");
  const install=path.win32.join(local,"Programs","SalamTech","ShopPOSEval",evaluationRelease,"Shop POS.exe");
  if(!sameWindowsPath(exe,install))throw Error("Installed evaluation identity required.");
  const dataRoot=path.win32.join(local,"Programs","SalamTech",evaluationRelease,"ShopPOSEvalData");
  if(path.win32.join(dataRoot,"test-results","sqlite-b1b-part1","b999999999").length>120)throw Error("Evaluation backup path budget exceeded.");
  return Object.freeze({mode:"evaluation",dataRoot});
 }
 return Object.freeze({mode:"test",dataRoot:resolveTestDataRoot(arguments_,environment,identity)});
}
module.exports={resolveDisposableTestDataRoot,resolveTestDataRoot,resolveInstalledDataRoot};
