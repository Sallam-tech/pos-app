"use client";
import type {createReportsService} from "@/server/reports/service";
type API=ReturnType<typeof createReportsService>;
export type Overview=Awaited<ReturnType<API["overview"]>>;
export type ProductsPage=Awaited<ReturnType<API["products"]>>;
export type ProductDetail=Awaited<ReturnType<API["product"]>>;
export type ExpensesPage=Awaited<ReturnType<API["expenses"]>>;
export type StockPage=Awaited<ReturnType<API["stock"]>>;
export type Basis={from:string;to:string;asOfMs:string;snapshot:string;catalog?:"YES"|"NO"};
export const reportParams=(p:Basis,query="",cursor?:string)=>new URLSearchParams({from:p.from,to:p.to,asOf:p.asOfMs,snapshot:p.snapshot,catalog:p.catalog??"NO",query,...(cursor?{cursor}:{})});
export async function reportFetch<T>(route:string,params:URLSearchParams):Promise<T>{const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),45000);try{const response=await fetch("/api/admin/reports/"+route+"?"+params,{credentials:"same-origin",cache:"no-store",redirect:"error",signal:abort.signal});const body=await response.json();if(!response.ok)throw Error(response.status===409?"Saved figures changed. Apply Period or refresh to reload a consistent report.":response.status===400?"Check the report dates and filters.":"Recorded report unavailable. Check the local server.");return body as T;}finally{clearTimeout(timer);}}
export function monthRange(value:string){if(!/^(?:[2-9][0-9]{3})-(?:0[1-9]|1[0-2])$/.test(value))throw Error("Choose a valid month.");return {from:value+"-01",to:new Date(Date.UTC(Number(value.slice(0,4)),Number(value.slice(5,7)),0)).toISOString().slice(0,10)};}
export const recordedTime=(ms:string)=>new Intl.DateTimeFormat("en-PK",{timeZone:"Asia/Karachi",dateStyle:"medium",timeStyle:"short"}).format(new Date(Number(ms)));
