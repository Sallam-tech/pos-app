import {spawn} from "node:child_process";
import {readFileSync,writeFileSync,existsSync} from "node:fs";
import path from "node:path";
const message=JSON.parse(readFileSync(process.argv[2],"utf8"));
writeFileSync(message.ready,"READY_BEFORE_NATIVE_CALL",{flag:"wx"});
const deadline=Date.now()+45000;
while(!existsSync(message.gate)){
  if(Date.now()>deadline)process.exit(2);
  await new Promise(resolve=>setTimeout(resolve,25));
}
const executable=path.join(process.env.SystemRoot,"System32/WindowsPowerShell/v1.0/powershell.exe");
const child=spawn(executable,["-NoLogo","-NoProfile","-NonInteractive","-File",message.nativeScript],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
const output=[],errors=[];let count=0;
child.stdout.on("data",b=>{count+=b.length;if(count>16384)child.kill();else output.push(Buffer.from(b));});
child.stderr.on("data",b=>{count+=b.length;if(count>16384)child.kill();else errors.push(Buffer.from(b));});
child.stdin.end(JSON.stringify(message.message));
const timeout=setTimeout(()=>child.kill(),10000);
child.once("close",code=>{
  clearTimeout(timeout);writeFileSync(message.stdout,Buffer.concat(output),{flag:"wx"});writeFileSync(message.stderr,Buffer.concat(errors),{flag:"wx"});
  writeFileSync(message.result,JSON.stringify({finished:true,exitCode:code===0?0:1}),{flag:"wx"});
});
