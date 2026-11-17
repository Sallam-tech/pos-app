import {test,expect} from "vitest";
import {generateKeyPairSync,X509Certificate,randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {existsSync,lstatSync} from "node:fs";
import path from "node:path";
import {assertLocalTlsMaterial} from "../../src/server/hosting/https";
function native(script:string,value:unknown){return new Promise<{code:number|null;body:string;stderr:string}>((resolve,reject)=>{
 const child=spawn(path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoLogo","-NoProfile","-NonInteractive","-File",path.resolve(script)],{windowsHide:true,stdio:["pipe","pipe","pipe"]});let body="",stderr="";
 child.stdout.on("data",v=>body+=v);child.stderr.on("data",v=>stderr+=v);child.once("error",reject);child.once("close",code=>resolve({code,body,stderr}));child.stdin.end(JSON.stringify(value));
});}
test("Windows inbox TLS issuer creates a valid independent TEST chain without Git/OpenSSL, trust installation or distributed keys",async()=>{
 const keys=generateKeyPairSync("rsa",{modulusLength:2048}),jwk=keys.publicKey.export({format:"jwk"}),value={modulus:Buffer.from(jwk.n!,"base64url").toString("base64"),exponent:Buffer.from(jwk.e!,"base64url").toString("base64")};
 const out=await native("src/server/desktop/tls.ps1",value);expect(out.code).toBe(0);expect(out.stderr).toBe("");
 const certificates=JSON.parse(out.body),pem=(v:string)=>Buffer.from("-----BEGIN CERTIFICATE-----\n"+v.match(/.{1,64}/g)!.join("\n")+"\n-----END CERTIFICATE-----\n");
 const tls={key:Buffer.from(keys.privateKey.export({format:"pem",type:"pkcs8"})),certificate:pem(certificates.certificate),trustAnchor:pem(certificates.trustAnchor)};
 expect(()=>assertLocalTlsMaterial(tls)).not.toThrow();
 expect(new X509Certificate(tls.certificate).checkPrivateKey(keys.privateKey)).toBe(true);
 expect(out.body).not.toContain("PRIVATE KEY");Object.values(tls).forEach(v=>v.fill(0));
});
test("private TEST data guard creates and rechecks only a new disposable directory; rejects arbitrary names and redirected paths",async()=>{
 const parent=path.resolve("test-results"),directory=path.join(parent,"posdt-"+randomUUID());
 const first=await native("../desktop/private-data.ps1",{directory});expect(first).toEqual({code:0,body:"true",stderr:""});expect(lstatSync(directory).isDirectory()).toBe(true);
 expect(await native("../desktop/private-data.ps1",{directory})).toEqual({code:0,body:"true",stderr:""});
 const denied=path.join(parent,"never-create-real-shop-"+randomUUID());expect((await native("../desktop/private-data.ps1",{directory:denied})).code).not.toBe(0);expect(existsSync(denied)).toBe(false);
 expect((await native("../desktop/private-data.ps1",{directory:path.join(directory,"..")})).code).not.toBe(0);
});

test("installer mutex guard follows the exact live parent and releases only after its exit",async()=>{
 const parent=spawn(process.execPath,["-e","process.stdin.resume()"],{windowsHide:true,stdio:["pipe","ignore","ignore"]});
 const guard=spawn(path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-File",path.resolve("../desktop/lifecycle.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 try{
  const initialized=new Promise<void>((resolve,reject)=>{let output="";const timer=setTimeout(()=>reject(Error("Guard readiness unavailable")),15000);guard.stdout.on("data",b=>{output+=b.toString();if(output.trim()==="READY"){clearTimeout(timer);resolve();}});guard.once("error",reject);guard.once("exit",()=>{clearTimeout(timer);reject(Error("Guard exited early"));});});
  guard.stdin.end(JSON.stringify({parentId:parent.pid}));await initialized;
  const exited=once(guard,"exit"),parentExited=once(parent,"exit");parent.stdin.end();expect((await parentExited)[0]).toBe(0);expect((await exited)[0]).toBe(0);
 }finally{parent.stdin.end();if(parent.exitCode===null)parent.kill();if(guard.exitCode===null)guard.kill();}
});

test("desktop startup is refused while the actual Windows maintenance mutex exists",async()=>{
 const parent=spawn(process.execPath,["-e","process.stdin.resume()"],{windowsHide:true,stdio:["pipe","ignore","ignore"]});
 const held=spawn(path.join(process.env.SystemRoot!,"System32/WindowsPowerShell/v1.0/powershell.exe"),["-NoProfile","-NonInteractive","-File",path.resolve("../desktop/tests/hold-maintenance.ps1")],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
 try{
  const ready=new Promise<void>((resolve,reject)=>{let text="";const timer=setTimeout(()=>reject(Error("Maintenance readiness unavailable")),15000);held.stdout.on("data",b=>{text+=b.toString();if(text.trim()==="READY"){clearTimeout(timer);resolve();}});held.once("error",reject);held.once("exit",()=>{clearTimeout(timer);reject(Error("Maintenance exited early"));});});
  held.stdin.end(JSON.stringify({parentId:parent.pid}));await ready;
  const result=await native("../desktop/lifecycle.ps1",{parentId:parent.pid});expect(result.code).toBe(1);expect(result.body).not.toContain("READY");
  const exited=once(held,"exit");parent.stdin.end();expect((await exited)[0]).toBe(0);
 }finally{parent.stdin.end();if(parent.exitCode===null)parent.kill();if(held.exitCode===null)held.kill();}
});
