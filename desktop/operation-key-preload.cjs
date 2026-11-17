"use strict";
const {contextBridge,ipcRenderer}=require("electron");
contextBridge.exposeInMainWorld("shopPosRecovery",Object.freeze({request:command=>ipcRenderer.invoke("shop-pos:operation-keys",command),login:password=>ipcRenderer.invoke("shop-pos:shared-login",password)}));