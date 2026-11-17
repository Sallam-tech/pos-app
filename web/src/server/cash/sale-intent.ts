import "server-only";
import {hash} from "node:crypto";
import {verifiedJson} from "../db/verified-json";
import {digest,object} from "../inventory/validation";
import {MONEY_POLICY} from "../sales/calculations";
import type {SaleLineInput} from "../sales/service";
export type CashSaleIntent={requestKey:string;context:string;lines:SaleLineInput[];customerName:string;customerPhone:string};
// Permission binds the cart. Tender/change/date must be separately observed.
export function cashSaleIntent(value:unknown):CashSaleIntent{const o=object(value,["requestKey","context","lines","customerName","customerPhone"],["cashPaisa","cashDate"]);const {cashPaisa,cashDate,...bound}=o;void cashPaisa;void cashDate;return bound as CashSaleIntent;}
// The common string-only shape has a fixed canonical key order. This encodes
// the same bytes afresh; unusual values retain the original generic semantics.
const lineKeys=["discountPercent","productId","quantity","unitPricePaisa"] as const;
function orderedStringLine(value:unknown):Record<string,string>|undefined{
 if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value))||"toJSON" in value)return;
 const descriptors=Object.getOwnPropertyDescriptors(value),keys=Object.keys(descriptors).filter(k=>descriptors[k].enumerable);
 if(keys.length!==4||keys.some(k=>!lineKeys.includes(k as typeof lineKeys[number])))return;
 const out:Record<string,string>={};for(const k of lineKeys){const d=descriptors[k];if(!d||!("value" in d)||typeof d.value!=="string")return;out[k]=d.value;}return out;
}
export function cashSaleIntentHash(value:unknown){
 const intent=cashSaleIntent(value);
 if(typeof intent.context==="string"&&typeof intent.customerName==="string"&&typeof intent.customerPhone==="string"&&typeof intent.requestKey==="string"&&Array.isArray(intent.lines)&&!("toJSON" in intent.lines)){
  const lines:Record<string,string>[]=[];for(let i=0;i<intent.lines.length;i++){const d=Object.getOwnPropertyDescriptor(intent.lines,String(i));if(!d||!("value" in d))return digest({kind:"SALE",policy:MONEY_POLICY,...intent});const line=orderedStringLine(d.value);if(!line)return digest({kind:"SALE",policy:MONEY_POLICY,...intent});lines.push(line);}
  const encoded=JSON.stringify({context:intent.context,customerName:intent.customerName,customerPhone:intent.customerPhone,kind:"SALE",lines,policy:MONEY_POLICY,requestKey:intent.requestKey});
  return hash("sha256",encoded,"hex");
 }
 return digest({kind:"SALE",policy:MONEY_POLICY,...intent});
}

// Parsing here guarantees plain JSON data properties (no getters, symbols or
// toJSON functions). The fast shape checks the exact original allowed keys;
// every unusual shape goes through the original strict validator and encoder.
export function cashSaleIntentHashFromJson(encoded:unknown,nested=false):string{
 const parsed:unknown=JSON.parse(String(encoded)),value=nested&&parsed&&typeof parsed==="object"?(parsed as {intent?:unknown}).intent:parsed;
 return hashParsedJsonIntent(value);
}
// The normal persisted shape has only these already-sorted JSON keys. Check
// the same strict roundtrip/canonical bytes and digest, then splice the verified
// scalar/array bytes into the original normalized intent hash. Unusual shapes
// keep the original general validator below; no row/hash verdict is retained.
const standardIntentKeys=["context","customerName","customerPhone","lines","requestKey"] as const;
function orderedKeys(value:unknown,expected:readonly string[]):value is Record<string,unknown>{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const keys=Object.keys(value);if(keys.length!==expected.length)return false;for(let i=0;i<keys.length;i++)if(keys[i]!==expected[i])return false;return true;
}
export type FreshCashAdmission={hash:string;value:Record<string,unknown>;intentJson?:string};
function standardAdmissionHash(encoded:unknown,checksum:unknown,key:unknown):FreshCashAdmission|undefined{
 if(typeof encoded!=="string"||typeof checksum!=="string")return;
 const value:unknown=JSON.parse(encoded);if(!value||typeof value!=="object"||Array.isArray(value))return;const saved=value as Record<string,unknown>;
 const simple=Boolean(orderedKeys(saved,["intent","shopName"])),detailed=!simple&&orderedKeys(saved,["expectedChargePaisa","intent","labels","plannedTenderPaisa","shopName"])&&typeof saved.expectedChargePaisa==="string"&&(saved.plannedTenderPaisa===null||typeof saved.plannedTenderPaisa==="string")&&Array.isArray(saved.labels)&&saved.labels.every(label=>orderedKeys(label,["code","name","productId","quantity","totalPaisa"])&&["name","productId","quantity","totalPaisa"].every(k=>typeof label[k]==="string")&&(label.code===null||typeof label.code==="string"));
 if(!(simple||detailed)||typeof saved.shopName!=="string"||!orderedKeys(saved.intent,standardIntentKeys))return;
 const intent=saved.intent;
 if(!["context","customerName","customerPhone","requestKey"].every(k=>typeof intent[k]==="string")||!Array.isArray(intent.lines)||
    !intent.lines.every(line=>orderedKeys(line,lineKeys)&&lineKeys.every(k=>typeof line[k]==="string"))||JSON.stringify(saved)!==encoded)return;
 if(hash("sha256",encoded,"hex")!==checksum||saved.shopName.length<1||saved.shopName.length>80||intent.requestKey!==key)throw Error("Cash admission unavailable.");
 const prefix='"intent":{',start=encoded.indexOf(prefix)+prefix.length,end=encoded.indexOf(detailed?' },"labels":'.slice(1):' },"shopName":'.slice(1),start),lines=encoded.indexOf(',"lines":',start),request=encoded.lastIndexOf(',"requestKey":',end);
 if(start<prefix.length||!encoded.startsWith('"context":',start)||lines<=start||request<=lines||end<=request)return;
 return {value:saved,intentJson:"{"+encoded.slice(start,end)+"}",hash:hash("sha256","{"+encoded.slice(start,lines)+',"kind":"SALE"'+encoded.slice(lines,request)+',"policy":'+JSON.stringify(MONEY_POLICY)+encoded.slice(request,end)+"}","hex")};
}
export function verifiedCashSaleAdmissionHash(encoded:unknown,checksum:unknown,key:unknown):string{return verifiedCashSaleAdmission(encoded,checksum,key).hash;}
// Fresh per-row values only; callers compose predicates before discarding them.
export function verifiedCashSaleAdmission(encoded:unknown,checksum:unknown,key:unknown):FreshCashAdmission{
 const normal=standardAdmissionHash(encoded,checksum,key);if(normal!==undefined)return normal;
 const saved=verifiedJson(encoded,checksum,true) as {intent:Record<string,unknown>;shopName:string};
 if(typeof saved.shopName!=="string"||saved.shopName.length<1||saved.shopName.length>80||saved.intent.requestKey!==key)throw Error("Cash admission unavailable.");
 return {hash:hashParsedJsonIntent(saved.intent),value:saved};
}
function hashParsedJsonIntent(value:unknown):string{
 if(value&&typeof value==="object"&&!Array.isArray(value)){
  const o=value as Record<string,unknown>,keys=Object.keys(o);
  if(keys.length>=5&&keys.length<=7&&keys.every(k=>["requestKey","context","lines","customerName","customerPhone","cashPaisa","cashDate"].includes(k))&&typeof o.context==="string"&&typeof o.customerName==="string"&&typeof o.customerPhone==="string"&&typeof o.requestKey==="string"&&Array.isArray(o.lines)){
   const lines:Record<string,string>[]=[];let normal=true;
   for(const value of o.lines){if(!value||typeof value!=="object"||Array.isArray(value)){normal=false;break;}const line=value as Record<string,unknown>;if(Object.keys(line).length!==4||!lineKeys.every(k=>typeof line[k]==="string")){normal=false;break;}lines.push({discountPercent:line.discountPercent as string,productId:line.productId as string,quantity:line.quantity as string,unitPricePaisa:line.unitPricePaisa as string});}
   if(normal)return hash("sha256",JSON.stringify({context:o.context,customerName:o.customerName,customerPhone:o.customerPhone,kind:"SALE",lines,policy:MONEY_POLICY,requestKey:o.requestKey}),"hex");
  }
 }
 return cashSaleIntentHash(value);
}

// A canonical cash-field prefix plus exact fresh canonical intent suffix proves
// strict JSON and the original normalized hash without reparsing either row.
// Every unusual shape retains the original strict JSON/hash fallback in the caller.
export function sharesVerifiedCashIntent(encoded:unknown,admitted:FreshCashAdmission):boolean{if(typeof encoded!=="string"||admitted.intentJson===undefined)return false;const prefix=/^\{(?:"cashDate":"[0-9]{4}-[0-9]{2}-[0-9]{2}",)?"cashPaisa":(?:null|"[0-9]{1,19}"),/.exec(encoded)?.[0];return prefix!==undefined&&encoded.slice(prefix.length)===admitted.intentJson.slice(1);}
