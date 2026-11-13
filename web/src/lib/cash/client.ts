"use client";
export async function cashFetch<T>(path:string,body?:unknown,context?:string):Promise<T>{
 const response=await fetch(path,{method:body===undefined?"GET":"POST",credentials:"same-origin",cache:"no-store",redirect:"error",headers:{...(body===undefined?{}:{"Content-Type":"application/json"}),...(context?{"X-Cash-Context":context}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(60000)});
 const value=await response.json();if(!response.ok&&!(response.status===404&&value.state==="UNKNOWN"))throw Error(value.code==="CONFLICT"?"Cash facts, authority or count cutoff changed. Keep the original key and check its outcome.":"Counter cash unavailable. Keep the original key; do not repeat physical money.");
 return value as T;
}
export const cashToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Karachi",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
