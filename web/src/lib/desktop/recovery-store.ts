"use client";
import {markerCommand,nativeMarker,markerFailure,type MarkerCommand,type MarkerModule,type MarkerSnapshot} from "../../server/desktop/recovery-contract";
declare global { interface Window {shopPosRecovery?:{request(command:MarkerCommand):Promise<{ok:boolean;value?:MarkerSnapshot}>;login?(password:string):Promise<{ok:boolean}>}} }
export function desktopRecovery(){return typeof window!=="undefined"&&window.shopPosRecovery!==undefined;}
async function request(command:MarkerCommand){
 const result=await window.shopPosRecovery?.request(markerCommand(command));
 if(!result?.ok||!result.value||Object.keys(result.value).sort().join(",")!=="marker,revision"||typeof result.value.revision!=="string"||!/^(0|[1-9][0-9]{0,14})$/.test(result.value.revision))return markerFailure();
 return {revision:result.value.revision,marker:nativeMarker(command.module,result.value.marker)};
}
// Share only an unfinished identical read in this renderer. No completed result,
// session or authorization is cached; writes always obtain their own fresh read.
const pendingReads=new Map<MarkerModule,ReturnType<typeof request>>(),epochs=new Map<MarkerModule,number>();
async function snapshot(module:MarkerModule,write:boolean){
 for(let attempt=0;attempt<2;attempt++){
  const epoch=epochs.get(module);let pending=write?undefined:pendingReads.get(module);
  if(!pending){
   pending=request({module,action:"read"});
   if(!write){const own=pending.finally(()=>{if(pendingReads.get(module)===own)pendingReads.delete(module);});pendingReads.set(module,own);pending=own;}
  }
  const value=await pending;
  if(write||epoch===epochs.get(module))return {revision:value.revision,marker:value.marker===null?null:{...value.marker}};
 }
 return markerFailure(); // A changing module cannot publish a stale empty view.
}
// Existing callers decide admission/confirmation/acknowledgement. Await the
// durable CAS acknowledgement before their existing financial fetch can execute.
export async function desktopMarkerAccess<M,T>(module:MarkerModule,write:boolean,validate:(value:unknown)=>M,work:(marker:M|null)=>{value:T;next?:M|null}):Promise<T>{
 if(write)epochs.set(module,(epochs.get(module)??0)+1);
 try{
  const current=await snapshot(module,write),changed=work(current.marker===null?null:validate(current.marker));
  if(changed.next!==undefined){if(!write)return markerFailure();await request({module,action:"cas",revision:current.revision,expected:current.marker,next:nativeMarker(module,changed.next)});}
  return changed.value;
 }finally{if(write)epochs.set(module,(epochs.get(module)??0)+1);}
}