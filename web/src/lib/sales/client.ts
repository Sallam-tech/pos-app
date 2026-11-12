"use client";
import type {Receipt,SaleLineInput} from "@/server/sales/service";
import {readMarker,claimMarker,confirmMarker,acknowledgeMarker,sameMarker,type RecoveryMarker} from "./recovery-store";
export type CatalogProduct={id:string;code:string;name:string;sizeLabel:string|null;unit:string;sellingPricePaisa:string};
export async function salesFetch(path:string,body?:unknown,context?:string){
 const response=await fetch(path,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(context?{"X-Sales-Context":context}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error("Sale unconfirmed or unavailable.");return response.json();
}
export const displayMoney=(paisa:string)=>"Rs. "+(BigInt(paisa)/BigInt(100)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",");
export const decimalMoney=(paisa:string)=>{const n=BigInt(paisa);return (n/BigInt(100)).toString()+"."+(n%BigInt(100)).toString().padStart(2,"0");};
export function quote(price:string,q:string,d:string){
 if(!/^[1-9][0-9]{0,11}$/.test(price)||!/^[1-9][0-9]{0,11}$/.test(q)||!/^(?:[0-9]|[1-9][0-9]|100)$/.test(d))return null;
 const numerator=BigInt(price)*(BigInt(100)-BigInt(d)),rounded=numerator/BigInt(100)+(numerator%BigInt(100)>=BigInt(50)?BigInt(1):BigInt(0));
 const total=rounded*BigInt(q)*BigInt(100);return total>BigInt(0)&&total<=BigInt("9223372036854775807")?total.toString():null;
}
export async function terminal(marker:RecoveryMarker){
 const data=await salesFetch("/api/pos/sale-operations/"+marker.key,undefined,marker.context);
 if(data.context!==marker.context||data.requestKey!==marker.key||!["COMMITTED","CANCELLED"].includes(data.state))throw Error("Operation remains UNKNOWN.");
 if(data.state==="COMMITTED"&&(!data.receipt||typeof data.receipt.id!=="string"))throw Error();
 return data as {state:"COMMITTED";receipt:Receipt}|{state:"CANCELLED"};
}
export async function restoreSale(){
 const marker=await readMarker();if(!marker)return {marker:null,outcome:null};
 const data=await terminal(marker),confirmed=marker.state==="CONFIRMED"?marker:await confirmMarker(marker);
 return {marker:confirmed,outcome:data};
}
export async function submitSale(lines:SaleLineInput[],cashPaisa:string|null,customerName:string,customerPhone:string){
 const context=(await salesFetch("/api/pos/sales/context")).context;if(typeof context!=="string"||!/^[0-9a-f]{64}$/.test(context))throw Error();
 const marker=await claimMarker({v:1,context,key:crypto.randomUUID(),kind:"SALE",state:"PENDING"});
 await salesFetch("/api/pos/sales",{requestKey:marker.key,context,lines,cashPaisa,customerName,customerPhone});
 // Explicit read proves committed data; POST success alone is not recovery proof.
 return restoreSale();
}
export async function acknowledgeSale(expected:RecoveryMarker,invoiceId?:string){
 const current=await readMarker();if(!sameMarker(current,expected)||expected.state!=="CONFIRMED")throw Error();
 const fresh=await terminal(expected);if(fresh.state==="COMMITTED"&&fresh.receipt.id!==invoiceId)throw Error();
 await acknowledgeMarker(expected);
}
