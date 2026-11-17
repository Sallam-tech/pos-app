import "server-only";
import {generateKeyPairSync} from "node:crypto";
import {spawn} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {assertLocalTlsMaterial,type LocalTlsMaterial} from "../hosting/https";
const pem=(kind:string,encoded:string)=>Buffer.from("-----BEGIN "+kind+"-----\n"+encoded.match(/.{1,64}/g)!.join("\n")+"\n-----END "+kind+"-----\n");
export async function createDesktopTestTls():Promise<LocalTlsMaterial>{
 const keys=generateKeyPairSync("rsa",{modulusLength:2048}),jwk=keys.publicKey.export({format:"jwk"});
 const message={modulus:Buffer.from(jwk.n!,"base64url").toString("base64"),exponent:Buffer.from(jwk.e!,"base64url").toString("base64")};
 const publicCertificates=await new Promise<{certificate:string;trustAnchor:string}>((resolve,reject)=>{
  const child=spawn(path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-File",fileURLToPath(new URL("./tls.ps1",import.meta.url))],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
  let bytes=0,errors=0;const chunks:Buffer[]=[];const timer=setTimeout(()=>{child.kill();reject(Error("TEST TLS issuance timed out."));},20000);
  child.stdout.on("data",(b:Buffer)=>{bytes+=b.length;if(bytes>65536){child.kill();return;}chunks.push(b);});child.stderr.on("data",(b:Buffer)=>{errors+=b.length;});
  child.once("error",reject);child.once("close",code=>{clearTimeout(timer);try{if(code||errors||bytes>65536)return reject(Error("TEST TLS issuance unavailable."));resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch{reject(Error("TEST TLS issuance unavailable."));}});
  child.stdin.on("error",reject);child.stdin.end(JSON.stringify(message));
 });
 const tls={key:Buffer.from(keys.privateKey.export({format:"pem",type:"pkcs8"})),certificate:pem("CERTIFICATE",publicCertificates.certificate),trustAnchor:pem("CERTIFICATE",publicCertificates.trustAnchor)};
 assertLocalTlsMaterial(tls);return tls;
}
