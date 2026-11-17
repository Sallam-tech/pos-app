import {test,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {runInNewContext} from "node:vm";
function bridge(){
 const source=readFileSync(path.resolve("../desktop/main.cjs"),"utf8"),fragment=source.slice(source.indexOf("const markerRequests="),source.indexOf("function validReady("));
 type Event={sender:{id:number;mainFrame:{url:string};getURL():string;session:{cookies:{get():Promise<unknown[]>}}};id?:number;senderFrame:{url:string}};
 let invoke!:(event:Event,command:unknown)=>Promise<{ok:boolean}>;const messages:Array<{id:string;value:unknown}>=[],timers=new Map<number,()=>void>();let next=0;
 const frame={url:"https://localhost:4443/admin/products"},sender={id:1,mainFrame:frame,getURL:()=>frame.url,session:{cookies:{get:async()=>[{secure:true,httpOnly:true,path:"/",name:"TEST_SESSION",value:"NON_BEARER_FIXTURE"}]}}},event:Event={sender,senderFrame:frame};
 const context={ipcMain:{handle:(_channel:string,handler:typeof invoke)=>{invoke=handler;}},ready:{origins:{ADMIN:"https://localhost:4443"}},shutdownStarted:false,recoveryBusy:false,child:{connected:true,send:(message:typeof messages[number],callback:(error?:Error)=>void)=>{messages.push(message);callback();}},roleWindows:new Map([["ADMIN",{isDestroyed:()=>false,webContents:sender}]]),roleOrigins:new Map([[1,"https://localhost:4443"]]),randomUUID,URL,diagnostic:()=>{},setTimeout:(fn:()=>void)=>{timers.set(++next,fn);return next;},clearTimeout:(id:number)=>timers.delete(id),deliver:undefined as unknown};
 runInNewContext(fragment+";globalThis.deliver=(id,value)=>markerRequests.get(id)?.finish(value);",context);
 return {event,invoke,messages,expire:()=>{for(const fn of [...timers.values()])fn();},deliver:context.deliver as (id:string,value:unknown)=>void};
}
test("actual Main handler refuses foreign windows/subframes/origins and still requires protected cookies",async()=>{
 const b=bridge(),command={module:"inventory",action:"read"};
 expect((await b.invoke({...b.event,senderFrame:{url:b.event.senderFrame.url}},command)).ok).toBe(false);
 expect((await b.invoke({...b.event,sender:{...b.event.sender,id:2}},command)).ok).toBe(false);
 b.event.senderFrame.url="https://foreign.invalid/";expect((await b.invoke(b.event,command)).ok).toBe(false);b.event.senderFrame.url="https://localhost:4443/admin/products";
 b.event.sender.session.cookies.get=async()=>[];expect((await b.invoke(b.event,command)).ok).toBe(false);expect(b.messages).toHaveLength(0);
});
test("lost ACK retains the original bounded backend reservation until its genuine late reply",async()=>{
 const b=bridge(),command={module:"inventory",action:"read"},pending=Array.from({length:8},()=>b.invoke(b.event,command));
 await vi.waitFor(()=>expect(b.messages).toHaveLength(8));expect((await b.invoke(b.event,command)).ok).toBe(false);
 b.expire();expect((await Promise.all(pending)).every(v=>v.ok===false)).toBe(true);
 expect((await b.invoke(b.event,command)).ok).toBe(false);expect(b.messages).toHaveLength(8);
 b.deliver(b.messages[0].id,{ok:false});const replacement=b.invoke(b.event,command);await vi.waitFor(()=>expect(b.messages).toHaveLength(9));
 b.deliver(b.messages[8].id,{ok:true,value:{revision:"0",marker:null}});expect((await replacement).ok).toBe(true);
 for(const message of b.messages.slice(1,8))b.deliver(message.id,{ok:false});
});