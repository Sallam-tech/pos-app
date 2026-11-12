import {createRequire} from "node:module";
interface Native{defaultSafeIntegers(v:boolean):void;pragma(s:string):unknown;prepare(s:string):{run(...v:unknown[]):unknown};transaction(w:(target:number)=>void):(target:number)=>void;close():void}
const Database=createRequire(import.meta.url)("better-sqlite3") as new(file:string)=>Native;
import {randomUUID} from "node:crypto";
import {canonical,digest} from "../../src/server/inventory/validation";
import type {CorrectionCommand} from "../../src/server/invoices/service";
import type {Receipt} from "../../src/server/sales/service";
import type {SqlRow} from "../../src/server/db/connection";
import type {RevisedReceipt} from "../../src/server/invoices/model";
export function volumeWriter(filename:string,context:string,original:Receipt,line:SqlRow,balance:SqlRow,session:SqlRow,recorded:bigint,date:string){
 const db=new Database(filename);db.defaultSafeIntegers(true);db.pragma("foreign_keys=ON");db.pragma("cache_size=-32768");let count=0,previous:string|null=null,settlement:string|null=null;
 const insert=(table:string,n:number)=>db.prepare("INSERT INTO "+table+" VALUES("+Array(n).fill("?").join(",")+")");const request=insert("invoice_correction_requests",14),authorization=insert("invoice_correction_authorizations",10),operation=insert("invoice_correction_operations",8),revision=insert("invoice_revisions",18),detail=insert("invoice_revision_lines",25),settle=insert("invoice_settlements",7);
 const add=db.transaction((target:number)=>{while(count<target){const version=BigInt(count+2),key=randomUUID(),grant=randomUUID(),op=randomUUID(),id=randomUUID(),lid=randomUUID(),sid=randomUUID(),unit=count%2?"11000":"10500",percent=count%2?"5":"0";
 const command:CorrectionCommand={invoiceId:original.id,expectedRevision:(version-BigInt(1)).toString(),lines:[{saleLineId:String(line.id),quantity:"3",unitPricePaisa:unit,discountPercent:percent,physicalQuantity:(BigInt(String(balance.sellable_q))/BigInt(1000000)).toString()}],reason:"SYNTHETIC TEST volume recording correction",stockEvidence:"SYNTHETIC TEST actual count matches ledger; no stock movement",settlementEvidence:"SYNTHETIC TEST original315 PKR verified; no cash difference",settlementVerified:"YES",cashDate:null,cashEvidence:"SYNTHETIC TEST no banknotes moved",effectiveDate:date};
 const proof=digest({revision:command.expectedRevision,payment:String(original.payment?line.payment_id:""),settlement,rows:[{id:line.id,q:String(balance.sellable_q),version:String(balance.version),cost:String(balance.cost_m),after:String(balance.sellable_q)}]});
 const receipt:RevisedReceipt={invoiceId:original.id,number:original.number,revision:version.toString(),businessDate:original.businessDate,correctedDate:date,recordedAtMs:recorded.toString(),shopName:original.shopName,customerName:original.customerName,customerPhone:original.customerPhone,lines:original.lines.map(l=>({...l,unitPricePaisa:unit,discountPercent:percent})),totalPaisa:original.totalPaisa,settlement:{originalReceivedPaisa:original.totalPaisa,priorAdjustmentTotalPaisa:"0",thisAdjustmentPaisa:"0",verifiedNetReceivedPaisa:original.totalPaisa,cashDate:null}};
 request.run(key,key,context,original.id,version-BigInt(1),"ADMIN",session.session_id,session.credential_version,session.auth_epoch,session.boot_generation,canonical(command),digest(command),proof,recorded);
 authorization.run(grant,key,"EXECUTE",session.session_id,session.credential_version,session.auth_epoch,session.boot_generation,recorded,recorded+BigInt(300000),null);
 operation.run(op,key,key,grant,"ADMIN",session.session_id,recorded,id);
 revision.run(id,original.id,version,previous,op,BigInt(1),BigInt(original.totalPaisa),BigInt(30000),BigInt(1500),BigInt(0),BigInt(0),command.reason,command.stockEvidence,command.settlementEvidence,date,recorded,canonical(receipt),digest(receipt));
 detail.run(lid,id,original.id,line.id,line.product_id,BigInt(1),BigInt(3000000),BigInt(unit),BigInt(percent),BigInt(10500),BigInt(31500),line.cost_snapshot_m,BigInt(30000),BigInt(unit)/BigInt(100)*(BigInt(100)-BigInt(percent)),BigInt(100),balance.cost_m,BigInt(1),BigInt(0),BigInt(0),BigInt(0),BigInt(0),balance.sellable_q,balance.sellable_q,balance.version,balance.sellable_q);
 settle.run(sid,id,original.id,line.payment_id,BigInt(31500),recorded,digest(receipt.settlement));previous=id;settlement=sid;count++;
 }});
 return {grow:(target:number)=>add(target),close:()=>db.close()};
}
