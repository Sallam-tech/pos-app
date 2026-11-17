import test from "node:test";
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {readFileSync,mkdirSync} from "node:fs";
import {randomUUID} from "node:crypto";
import path from "node:path";
test("actual TEST diagnostic function survives a genuinely broken stderr pipe and continues durable stage records",async()=>{
 const source=readFileSync(path.resolve("desktop/main.cjs"),"utf8"),start=source.indexOf('const diagnosticHarness='),end=source.indexOf('const safeError=',start);assert.ok(start>=0&&end>start);
 const dir=path.resolve("desktop/test-results/diagnostic-pipe-"+randomUUID());mkdirSync(dir);const log=path.join(dir,"stages.log");
 const code='const fs=require("node:fs");process.argv.push("--disposable-harness");'+source.slice(start,end)+'diagnosticPath='+JSON.stringify(log)+';process.stdin.once("data",()=>{diagnostic("BEFORE_PIPE");setTimeout(()=>{diagnostic("AFTER_PIPE");process.stdout.write(JSON.stringify({streamOpen:diagnosticStreamOpen,continued:true}));},200);});';
 const child=spawn(process.execPath,["-e",code],{windowsHide:true,stdio:["pipe","pipe","pipe"]});let out="";child.stdout.on("data",v=>out+=v);const ended=new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",resolve);});child.stderr.destroy();child.stdin.end("go");assert.equal(await ended,0);assert.deepEqual(JSON.parse(out),{streamOpen:false,continued:true});assert.equal(readFileSync(log,"utf8"),"BEFORE_PIPE\nAFTER_PIPE\n");
});
