import {cashSaleIntent} from "../../src/server/cash/sale-intent";
import {digest} from "../../src/server/inventory/validation";
import {MONEY_POLICY} from "../../src/server/sales/calculations";
import {verifiedJson} from "../../src/server/db/verified-json";
import type {AuthorizedTransaction} from "../../src/server/auth/types";
const hash=(v:unknown)=>digest({kind:"SALE",policy:MONEY_POLICY,...cashSaleIntent(v)});
export async function baselineCashSaleBindings(tx:AuthorizedTransaction){
 if(await tx.get("SELECT r.id FROM counter_cash_admission_resolutions r JOIN counter_cash_admissions a ON a.id=r.admission_id LEFT JOIN sale_operations o ON o.id=r.sale_operation_id WHERE a.source_kind='SALE' AND r.outcome='POSTED' AND (o.id IS NULL OR o.request_key<>a.source_key) LIMIT 1"))throw Error("Invalid");
 for(const r of await tx.all("SELECT a.payload_hash,o.payload_json FROM counter_cash_admission_resolutions r JOIN counter_cash_admissions a ON a.id=r.admission_id JOIN sale_operations o ON o.id=r.sale_operation_id WHERE r.outcome='POSTED'"))if(hash(JSON.parse(String(r.payload_json)))!==r.payload_hash)throw Error("Invalid");
 for(const a of await tx.all("SELECT * FROM counter_cash_admissions WHERE source_kind='SALE'")){const saved=verifiedJson(a.payload_json,a.payload_digest,true) as {intent:Record<string,unknown>;shopName:string};if(typeof saved.shopName!=="string"||saved.shopName.length<1||saved.shopName.length>80||saved.intent.requestKey!==a.source_key||hash(saved.intent)!==a.payload_hash)throw Error("Invalid");}
}
