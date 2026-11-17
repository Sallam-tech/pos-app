"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("shopPOSTestOwner",Object.freeze({context:()=>ipcRenderer.invoke("shop-pos:native-owner-context"),submit:value=>ipcRenderer.invoke("shop-pos:native-owner-submit",value)}));