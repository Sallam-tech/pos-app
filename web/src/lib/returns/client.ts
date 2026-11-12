"use client";
import {readMarker,claimMarker,confirmMarker,acknowledgeMarker,sameMarker,type RecoveryMarker} from "./recovery-store";
export type ReturnRole="ADMIN"|"SALESPERSON";
export async function returnsFetch(path:string,body?:unknown,context?:string,allowUnknown=false){
 const r=await fetch(path,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(context?{"X-Return-Context":context}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 if(!r.ok&&!(allowUnknown&&r.status===404))throw Error("Return unconfirmed or unavailable.");const data=await r.json();if(!r.ok&&data.state!=="UNKNOWN")throw Error();return data;
}
export async function claim(kind:RecoveryMarker["kind"]){const {context}=await returnsFetch("/api/returns/context");if(typeof context!=="string"||!/^[0-9a-f]{64}$/.test(context))throw Error();return claimMarker({v:1,key:crypto.randomUUID(),context,kind,state:"PENDING"});}
export function changed(){const c=new BroadcastChannel("pos-test-returns-changes");c.postMessage("changed");c.close();}
export async function check(m:RecoveryMarker,role:ReturnRole){
 const path=role==="ADMIN"?"/api/admin/return-operations/"+m.key+"/recovery":"/api/pos/return-operations/"+m.key;
 const result=await returnsFetch(path,undefined,m.context,true);
 if(result.key!==m.key||result.context!==m.context||(result.kind!==undefined&&result.kind!==m.kind))throw Error();
 const terminal=["COMMITTED","CANCELLED"].includes(result.state),marker=terminal&&m.state!=="CONFIRMED"?await confirmMarker(m):m;
 return {marker,result};
}
export async function acknowledge(m:RecoveryMarker,role:ReturnRole){const current=await readMarker();if(!sameMarker(current,m)||m.state!=="CONFIRMED")throw Error();const fresh=await check(m,role);if(!["COMMITTED","CANCELLED"].includes(fresh.result.state))throw Error();await acknowledgeMarker(m);changed();}
