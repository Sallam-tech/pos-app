import {test,expect,vi,afterEach} from "vitest";
import {randomUUID} from "node:crypto";
import * as sales from "../../src/lib/sales/recovery-store";
import * as inventory from "../../src/lib/inventory/recovery-store";
import * as returns from "../../src/lib/returns/recovery-store";
import * as expenses from "../../src/lib/expenses/recovery-store";
import * as invoices from "../../src/lib/invoices/recovery-store";
import * as cash from "../../src/lib/cash/recovery-store";
import * as settings from "../../src/lib/settings/recovery-store";
import {desktopMarkerAccess} from "../../src/lib/desktop/recovery-store";
import type {MarkerCommand} from "../../src/server/desktop/recovery-contract";
afterEach(()=>vi.unstubAllGlobals());
test("all seven real client stores await durable native acknowledgement before the caller can POST",async()=>{
 const stores=[sales,inventory,returns,expenses,invoices,cash,settings];const kinds=["SALE","CREATE","REFUND","CREATE","CORRECT","CASH","SETTINGS"];
 for(let i=0;i<stores.length;i++){
  let acknowledge!:(value:unknown)=>void,posted=false;const calls:MarkerCommand[]=[];
  vi.stubGlobal("window",{shopPosRecovery:{request:async(command:MarkerCommand)=>{calls.push(command);if(command.action==="read")return {ok:true,value:{revision:"7",marker:null}};return await new Promise(resolve=>acknowledge=resolve);}}});
  const marker={v:1 as const,key:randomUUID(),context:"a".repeat(64),kind:kinds[i],state:"PENDING" as const};
  const result=stores[i].claimMarker(marker as never).then(()=>{posted=true;});
  await vi.waitFor(()=>expect(calls).toHaveLength(2));expect(posted).toBe(false);expect(calls[1]).toMatchObject({action:"cas",revision:"7",expected:null,next:marker});
  acknowledge({ok:true,value:{revision:"8",marker}});await result;expect(posted).toBe(true);
 }
});
test("checkpoint failure or lost acknowledgement blocks POST; a fresh read preserves the original uncertain key",async()=>{
 const marker={v:1 as const,key:randomUUID(),context:"b".repeat(64),kind:"SALE" as const,state:"PENDING" as const};let stored:unknown=null,posted=false;
 vi.stubGlobal("window",{shopPosRecovery:{request:async(command:MarkerCommand)=>{if(command.action==="read")return {ok:true,value:{revision:"0",marker:stored}};stored=command.next;return {ok:false};}}});
 await expect(sales.claimMarker(marker).then(()=>{posted=true;})).rejects.toThrow();expect(posted).toBe(false);expect(await sales.readMarker()).toEqual(marker);
 await expect(sales.claimMarker({...marker,key:randomUUID()})).rejects.toThrow();expect(posted).toBe(false);
});
test("eighth backup marker adapter preserves the original job and archive UUID without touching browser storage",async()=>{
 const marker={key:randomUUID(),kind:"restore" as const,archiveId:randomUUID()};let stored:unknown=null,revision=0;
 vi.stubGlobal("window",{shopPosRecovery:{request:async(command:MarkerCommand)=>{if(command.action==="cas"){expect(command.revision).toBe(String(revision));stored=command.next;revision++;}return {ok:true,value:{revision:String(revision),marker:stored}};}}});
 const validate=(v:unknown)=>v as typeof marker;
 await desktopMarkerAccess("backup",true,validate,current=>{expect(current).toBeNull();return {value:undefined,next:marker};});
 expect(await desktopMarkerAccess("backup",false,validate,current=>({value:current}))).toEqual(marker);
});test("terminal invoice and expense reinspection can confirm the same saved marker without replacing its key",async()=>{
 const {markerTransition}=await import("../../src/server/desktop/recovery-contract");
 for(const store of [expenses,invoices]){
  const family=store===expenses?"expenses":"invoices",marker={v:1 as const,key:randomUUID(),context:"c".repeat(64),kind:store===expenses?"CREATE":"CORRECT",state:"CONFIRMED" as const};let revision=1;
  vi.stubGlobal("window",{shopPosRecovery:{request:async(command:MarkerCommand)=>{if(command.action==="cas"){markerTransition(family,command.expected,command.next);expect(command.revision).toBe(String(revision));revision++;}return {ok:true,value:{revision:String(revision),marker}};}}});
  expect(await store.confirmMarker(marker as never)).toEqual(marker);expect(revision).toBe(2);
 }
});

test("overlapping read-only polls share only their unfinished request and release success/failure immediately",async()=>{
 const replies:Array<(v:unknown)=>void>=[];let calls=0;
 vi.stubGlobal("window",{shopPosRecovery:{request:async()=>{calls++;return new Promise(resolve=>replies.push(resolve));}}});
 const a=inventory.readMarker(),b=inventory.readMarker();expect(calls).toBe(1);
 replies[0]({ok:true,value:{revision:"3",marker:null}});expect(await a).toBeNull();expect(await b).toBeNull();
 const c=inventory.readMarker();expect(calls).toBe(2);replies[1]({ok:false});await expect(c).rejects.toThrow();
 const d=inventory.readMarker();expect(calls).toBe(3);replies[2]({ok:true,value:{revision:"4",marker:null}});expect(await d).toBeNull();
});
test("a mutation never reuses an outstanding poll and still waits for exact fresh CAS acknowledgement",async()=>{
 let resolvePoll!:(v:unknown)=>void,ack!:(v:unknown)=>void;const calls:MarkerCommand[]=[];
 const marker={v:1 as const,key:randomUUID(),context:"d".repeat(64),kind:"CREATE" as const,state:"PENDING" as const};
 vi.stubGlobal("window",{shopPosRecovery:{request:async(command:MarkerCommand)=>{calls.push(command);if(calls.length===1)return new Promise(resolve=>resolvePoll=resolve);if(command.action==="read")return {ok:true,value:calls.length===2?{revision:"9",marker:null}:{revision:"10",marker}};return new Promise(resolve=>ack=resolve);}}});
 const poll=inventory.readMarker(),save=inventory.claimMarker(marker);await vi.waitFor(()=>expect(calls).toHaveLength(3));expect(calls[2]).toMatchObject({action:"cas",revision:"9",expected:null,next:marker});
 ack({ok:true,value:{revision:"10",marker}});expect(await save).toEqual(marker);
 resolvePoll({ok:true,value:{revision:"8",marker:null}});expect(await poll).toEqual(marker);expect(calls).toHaveLength(4);
});