import {spawn} from "node:child_process";
import {readFileSync,writeFileSync,openSync,closeSync} from "node:fs";
import path from "node:path";
process.once("message", message => {
  // Detached Windows helpers use a metadata-only fixture file, never a password/key.
  const payload=message.ready+".payload.json";writeFileSync(payload,JSON.stringify(message),{flag:"wx"});
  const output=openSync(message.stdout+".wrapper","wx"),errors=openSync(message.stderr+".wrapper","wx");
  const helper=spawn(process.execPath,[path.resolve("tests/helpers/candidate-publication-delayed.mjs"),payload],{windowsHide:true,detached:true,stdio:["ignore",output,errors]});
  closeSync(output);closeSync(errors);
  helper.once("error",()=>process.exit(1));
  const started=Date.now(),timer=setInterval(()=>{
    let ready=false;try{ready=readFileSync(message.ready,"utf8")==="READY_BEFORE_NATIVE_CALL";}catch{ /* Not ready yet. */ }
    if(ready){clearInterval(timer);process.send({status:"DELAYED_NATIVE_HELPER_READY",pid:helper.pid});}
    else if(Date.now()-started>15000){clearInterval(timer);process.exitCode=1;}
  },25);
});
