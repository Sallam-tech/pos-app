"use strict";
const path=require("node:path");

// This policy is deliberately separate from the installed TEST identity and
// never accepts an environment-selected database or a disposable harness.
const release="1.0.0";
function same(left,right){return path.win32.resolve(left).toLowerCase()===path.win32.resolve(right).toLowerCase();}
function resolveProductionDataRoot(arguments_,environment,identity){
 if(!Array.isArray(arguments_)||arguments_.length||!identity||identity.version!==release)throw Error("Production application identity required.");
 if(environment?.SHOP_POS_DESKTOP_TEST_DATA!==undefined||environment?.SHOP_POS_PRODUCTION_DATA!==undefined)throw Error("Environment-selected data denied.");
 if(typeof environment?.LOCALAPPDATA!=="string"||!path.win32.isAbsolute(environment.LOCALAPPDATA)||
    typeof identity.appDataPath!=="string"||!path.win32.isAbsolute(identity.appDataPath)||
    typeof identity.executablePath!=="string"||!path.win32.isAbsolute(identity.executablePath))throw Error("Windows user profile identity required.");
 const appData=path.win32.resolve(identity.appDataPath),parent=path.win32.dirname(appData);
 const local=path.win32.resolve(environment.LOCALAPPDATA);
 if(path.win32.basename(appData).toLowerCase()!=="roaming"||path.win32.basename(parent).toLowerCase()!=="appdata"||
    !same(local,path.win32.join(parent,"Local")))throw Error("Windows user profile identity required.");
 const executable=path.win32.join(local,"Programs","SalamTech","ShopPOS",release,"Shop POS.exe");
 if(!same(identity.executablePath,executable))throw Error("Installed production executable required.");
 const root=path.win32.join(local,"Programs","SalamTech","ShopPOSData",release);
 if(path.win32.join(root,"protected-identity","candidate-authority","e999999999").length>200)throw Error("Protected data path budget exceeded.");
 return root;
}
module.exports={release,resolveProductionDataRoot};
