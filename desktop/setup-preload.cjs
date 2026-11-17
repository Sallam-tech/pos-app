"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("shopPOSTestSetup",Object.freeze({
 submit(value){return ipcRenderer.invoke("shop-pos:trusted-test-setup",value);}
}));
