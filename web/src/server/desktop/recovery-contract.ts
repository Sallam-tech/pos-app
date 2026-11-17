// Metadata only. This format grants no session, financial or database authority.
export const markerKinds = {
 sales:["SALE"], inventory:["CREATE","EDIT","SELLING_PRICE","STATUS","ARCHIVE","REPRICE","RECEIVE","ADJUST"],
 returns:["REFUND","DISPOSITION"], expenses:["CREATE","REVISE","REVERSE"], invoices:["CORRECT"], cash:["CASH"],
 settings:["SETTINGS","PASSWORD_ADMIN","PASSWORD_SALESPERSON"], backup:["manual","export","restore"],
} as const;
export type MarkerModule=keyof typeof markerKinds;
export type NativeMarker={v:1;context:string;key:string;kind:string;state:"PENDING"|"ATTEMPTED"|"CONFIRMED"}|{key:string;kind:"manual"|"export"|"restore";archiveId?:string};
export type MarkerSnapshot={revision:string;marker:NativeMarker|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const markerFailure=():never=>{throw Error("Original recovery key storage unavailable. Commands blocked.");};
export function markerModule(v:unknown):MarkerModule {if(typeof v!=="string"||!Object.hasOwn(markerKinds,v))return markerFailure();return v as MarkerModule;}
export function nativeMarker(module:MarkerModule,value:unknown):NativeMarker|null {
 if(value===null)return null;if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>512)return markerFailure();
 const m=value as Record<string,unknown>;if(typeof m.key!=="string"||!uuid.test(m.key)||typeof m.kind!=="string"||!(markerKinds[module] as readonly string[]).includes(m.kind))return markerFailure();
 if(module==="backup"){
  const expected=m.kind==="manual"?"key,kind":"archiveId,key,kind";
  if(Object.keys(m).sort().join(",")!==expected||m.kind!=="manual"&&(typeof m.archiveId!=="string"||!uuid.test(m.archiveId)))return markerFailure();
 }else if(Object.keys(m).sort().join(",")!=="context,key,kind,state,v"||m.v!==1||typeof m.context!=="string"||!/^[a-f0-9]{64}$/.test(m.context)||!["PENDING","CONFIRMED",...(["sales","expenses","invoices","cash"].includes(module)?["ATTEMPTED"]:[])].includes(String(m.state)))return markerFailure();
 return value as NativeMarker;
}
export const sameNativeMarker=(a:NativeMarker|null,b:NativeMarker|null)=>a===null?b===null:b!==null&&Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>(b as Record<string,unknown>)[k]===v);
export function markerTransition(module:MarkerModule,previous:NativeMarker|null,next:NativeMarker|null){
 nativeMarker(module,previous);nativeMarker(module,next);
 if(previous===null){if(next===null||module!=="backup"&&(!("state" in next)||next.state!=="PENDING"))return markerFailure();return;}
 if(next===null){if(module!=="backup"&&(!("state" in previous)||previous.state!=="CONFIRMED"))return markerFailure();return;}
 if(module==="backup"||!("state" in previous)||!("state" in next))return markerFailure();
 const from=previous.state,to=next.state;
 // Existing invoice/expense recovery re-confirms a freshly checked terminal marker.
 if(from==="CONFIRMED"&&to==="CONFIRMED"&&sameNativeMarker(previous,next))return;
 if(!sameNativeMarker({...previous,state:to},next)||from==="CONFIRMED"||from===to||!(to==="CONFIRMED"||from==="PENDING"&&to==="ATTEMPTED"))return markerFailure();
}
export type MarkerCommand={module:MarkerModule;action:"read"}|{module:MarkerModule;action:"cas";revision:string;expected:NativeMarker|null;next:NativeMarker|null};
export function markerCommand(value:unknown):MarkerCommand{
 if(!value||typeof value!=="object"||Array.isArray(value)||JSON.stringify(value).length>1600)return markerFailure();const m=value as Record<string,unknown>,family=markerModule(m.module);
 if(m.action==="read"&&Object.keys(m).sort().join(",")==="action,module")return {module:family,action:"read"};
 if(m.action!=="cas"||Object.keys(m).sort().join(",")!=="action,expected,module,next,revision"||typeof m.revision!=="string"||!/^(0|[1-9][0-9]{0,14})$/.test(m.revision))return markerFailure();
 return {module:family,action:"cas",revision:m.revision,expected:nativeMarker(family,m.expected),next:nativeMarker(family,m.next)};
}