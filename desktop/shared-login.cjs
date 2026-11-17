"use strict";
function passwordInput(value){return typeof value==="string"&&value.length<=256&&Array.from(value).length>=8&&Array.from(value).length<=128&&Buffer.byteLength(value,"utf8")<=512;}
function cookiesForRole(cookies,role,origin){
 if(!["ADMIN","SALESPERSON"].includes(role)||!Array.isArray(cookies)||!cookies.length||cookies.length>8)throw Error("Login failed.");
 const url=new URL(origin);if(url.protocol!=="https:"||url.hostname!==(role==="ADMIN"?"localhost":"127.0.0.1")||!url.port||url.origin!==origin)throw Error("Login failed.");
 const prefix=role==="ADMIN"?"__Secure-pos-admin.":"__Secure-pos-salesperson.",seen=new Set();
 return cookies.map(cookie=>{
  if(typeof cookie!=="string"||cookie.length>4096||/[\r\n\x00]/.test(cookie))throw Error("Login failed.");
  const parts=cookie.split(";").map(v=>v.trim()),at=parts[0].indexOf("="),name=parts[0].slice(0,at),value=parts[0].slice(at+1),attributes=new Map();
  if(at<1||!name.startsWith(prefix)||!/^[A-Za-z0-9_.-]+$/.test(name)||seen.has(name)||!value||/[^\x21-\x7e]|[,;]/.test(value))throw Error("Login failed.");seen.add(name);
  for(const part of parts.slice(1)){const split=part.indexOf("="),key=(split<0?part:part.slice(0,split)).toLowerCase(),v=split<0?"":part.slice(split+1);if(attributes.has(key)||!["secure","httponly","samesite","path","max-age","expires"].includes(key))throw Error("Login failed.");attributes.set(key,v);}
  if(!attributes.has("secure")||attributes.get("secure")!==""||!attributes.has("httponly")||attributes.get("httponly")!==""||attributes.get("samesite")?.toLowerCase()!=="strict"||attributes.get("path")!=="/")throw Error("Login failed.");
  const parsed={url:origin+"/",name,value,path:"/",secure:true,httpOnly:true,sameSite:"strict"};
  if(attributes.has("max-age")){const age=attributes.get("max-age");if(!/^[1-9][0-9]{0,7}$/.test(age))throw Error("Login failed.");parsed.expirationDate=Date.now()/1000+Number(age);}
  else if(attributes.has("expires")){const time=Date.parse(attributes.get("expires"))/1000;if(!Number.isFinite(time)||time<=Date.now()/1000)throw Error("Login failed.");parsed.expirationDate=time;}
  return parsed;
 });
}
module.exports={passwordInput,cookiesForRole};
