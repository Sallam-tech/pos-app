import {test,expect} from "vitest";import {createHash} from "node:crypto";import {canonical} from "../../src/server/inventory/validation";import {verifiedCashSaleAdmissionHash,cashSaleIntent} from "../../src/server/cash/sale-intent";import {MONEY_POLICY} from "../../src/server/sales/calculations";
const old=(v:unknown)=>createHash("sha256").update(canonical(v)).digest("hex");
test("standard admission splice preserves original hashes for escaped delimiters, Unicode, optional/extra fields and strict canonical rejection",()=>{
 const fragments=["plain",'","lines":[{"x":"x"}],"requestKey":"injected',"},"+String.fromCharCode(34)+"shopName"+String.fromCharCode(34)+":","\\","\\\\","\n","\t",String.fromCharCode(0),String.fromCharCode(0xd800),String.fromCharCode(0xdc00),String.fromCodePoint(0x1f600),String.fromCharCode(0x2028),"__proto__","constructor","toJSON"];
 for(let i=0;i<650;i++){const text=fragments[i%fragments.length]+i,intent={context:text,customerName:fragments[(i+1)%fragments.length],customerPhone:fragments[(i+2)%fragments.length],requestKey:text+"key",lines:Array.from({length:i%5},(_,j)=>({discountPercent:fragments[(i+j)%fragments.length],productId:text,quantity:"3",unitPricePaisa:"11000"}))};const payload={intent,shopName:"TEST SHOP"},encoded=canonical(payload);
 expect(verifiedCashSaleAdmissionHash(encoded,old(payload),intent.requestKey)).toBe(old({kind:"SALE",policy:MONEY_POLICY,...cashSaleIntent(intent)}));
 const full={expectedChargePaisa:"11000",intent,labels:[{code:null,name:text,productId:text,quantity:"1",totalPaisa:text}],plannedTenderPaisa:i%2?null:text,shopName:"TEST SHOP"};expect(verifiedCashSaleAdmissionHash(canonical(full),old(full),intent.requestKey)).toBe(old({kind:"SALE",policy:MONEY_POLICY,...cashSaleIntent(intent)}));
 expect(()=>verifiedCashSaleAdmissionHash(canonical(full),"0".repeat(64),intent.requestKey)).toThrow();
 expect(()=>verifiedCashSaleAdmissionHash(encoded,old(payload),"wrong")).toThrow();expect(()=>verifiedCashSaleAdmissionHash(encoded,"0".repeat(64),intent.requestKey)).toThrow();
 expect(()=>verifiedCashSaleAdmissionHash(" "+encoded,old(payload),intent.requestKey)).toThrow();
 for(const changed of [{...payload,other:{z:1,a:2}},{...payload,intent:{...intent,cashDate:{context:"nested"},cashPaisa:null}}])expect(verifiedCashSaleAdmissionHash(canonical(changed),old(changed),intent.requestKey)).toBe(old({kind:"SALE",policy:MONEY_POLICY,...cashSaleIntent(changed.intent)}));
 const duplicate=encoded.replace('"context":','"context":"discarded","context":');expect(()=>verifiedCashSaleAdmissionHash(duplicate,old(payload),intent.requestKey)).toThrow();
 }
});
