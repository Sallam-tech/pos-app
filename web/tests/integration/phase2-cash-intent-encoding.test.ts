import {test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {cashSaleIntent,cashSaleIntentHash,cashSaleIntentHashFromJson} from "../../src/server/cash/sale-intent";
import {digest} from "../../src/server/inventory/validation";
import {MONEY_POLICY} from "../../src/server/sales/calculations";
const reference=(v:unknown)=>digest({kind:"SALE",policy:MONEY_POLICY,...cashSaleIntent(v)});
const base=()=>({requestKey:randomUUID(),context:randomUUID(),customerName:"\u062f\u0648\u062f\u06be \" \\ \n 😀",customerPhone:"001234",lines:[{productId:randomUUID(),quantity:"3",unitPricePaisa:"11000",discountPercent:"5"}]});
test("cash-intent optimized bytes match original encoder across genuine, shuffled, Unicode and fallback shapes",()=>{
 for(let i=0;i<350;i++){const v=base();v.customerName+=String(i);v.lines=Array.from({length:1+i%6},()=>({...v.lines[0],productId:randomUUID()}));const shuffled=Object.fromEntries(Object.entries(v).reverse());expect(cashSaleIntentHash(shuffled)).toBe(reference(shuffled));expect(cashSaleIntentHash({...shuffled,cashPaisa:"50000",cashDate:"2026-11-16"})).toBe(reference(shuffled));}
 for(const line of [null,[],"line",{productId:"p",quantity:"1",unitPricePaisa:"2",discountPercent:0},{productId:"p",quantity:"1",unitPricePaisa:"2",discountPercent:"0",extra:"preserved"},{"2":"index",nested:{z:2,a:1}},Object.create(null),{toJSON(){return {z:"original",a:1};}}]){const v={...base(),lines:[line]};expect(cashSaleIntentHash(v)).toBe(reference(v));}
 const sparse={...base(),lines:Array(2)};expect(cashSaleIntentHash(sparse)).toBe(reference(sparse));
 const hidden=Object.defineProperty({...base().lines[0]},"secret",{value:"hidden",enumerable:false});const v={...base(),lines:[hidden]};expect(cashSaleIntentHash(v)).toBe(reference(v));
 const getter={...base(),lines:[Object.defineProperty({...base().lines[0]},"quantity",{get:()=>"2",enumerable:true})]};expect(cashSaleIntentHash(getter)).toBe(reference(getter));
});
test("cash intent retains strict descriptor/unknown-key rejection and all line/customer bindings",()=>{
 for(const v of [{...base(),extra:"denied"},Object.defineProperty(base(),"context",{get:()=>"denied"})])expect(()=>cashSaleIntentHash(v)).toThrow();
 const v=base(),hash=cashSaleIntentHash(v);for(const change of [{...v,customerName:"changed"},{...v,context:randomUUID()},{...v,lines:[{...v.lines[0],quantity:"4"}]},{...v,lines:[{...v.lines[0],unitPricePaisa:"1"}]}])expect(cashSaleIntentHash(change)).not.toBe(hash);
});

test("JSON-only fast path preserves original validation and hashes across normal/fallback and tampered data",()=>{
 for(let i=0;i<350;i++){const v={...base(),cashPaisa:i%2?null:"11000",cashDate:"2026-11-16"};expect(cashSaleIntentHashFromJson(JSON.stringify(v))).toBe(reference(v));expect(cashSaleIntentHashFromJson(JSON.stringify({intent:v,shopName:"TEST"}),true)).toBe(reference(v));}
 for(const value of [null,[],{}, {...base(),extra:"denied"}, {...base(),lines:[{toJSON:"string",productId:"p"}]}, {...base(),lines:[null]}, {...base(),lines:[{productId:"p",quantity:1,unitPricePaisa:"2",discountPercent:"0"}]}]){const encoded=JSON.stringify(value);let expected:string;try{expected=reference(JSON.parse(encoded));}catch{expect(()=>cashSaleIntentHashFromJson(encoded)).toThrow();continue;}expect(cashSaleIntentHashFromJson(encoded)).toBe(expected);}
 expect(()=>cashSaleIntentHashFromJson("{bad-json")).toThrow();
});
