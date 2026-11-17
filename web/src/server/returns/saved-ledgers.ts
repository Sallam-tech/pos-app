import "server-only";
import type {AuthorizedTransaction} from "../auth/types";
import {assertReturnLedgersFull,SALE_FINANCIAL_GUARD,SALE_PAYMENT_GUARD} from "./ledgers";
// Fresh original guard predicates, narrowed only for the original SALE rows of
// returned receipts. Refunds, revisions, dispositions and every other query stay
// global and unchanged. This helper never mints a native validation receipt.
export async function assertSavedReturnLedgers(tx:Pick<AuthorizedTransaction,"get"|"all">,invoiceIds:readonly string[]){
 if(invoiceIds.length>50)throw Error("Saved ledger selection unavailable.");
 const driver=new Map([[SALE_FINANCIAL_GUARD,"l.invoice_id"],[SALE_PAYMENT_GUARD,"p.invoice_id"]]);
 await assertReturnLedgersFull({all:(sql,values)=>tx.all(sql,values),async get(sql,values=[]){
  const column=driver.get(sql);if(!column)return tx.get(sql,values);
  if(values.length)throw Error("Unreviewed saved ledger bindings.");
  return tx.get(narrowSavedSaleGuard(sql,column,invoiceIds.length),invoiceIds);
 }});
}
export function narrowSavedSaleGuard(sql:string,column:string,count:number){
 if(!((sql===SALE_FINANCIAL_GUARD&&column==="l.invoice_id")||(sql===SALE_PAYMENT_GUARD&&column==="p.invoice_id"))||!Number.isInteger(count)||count<0||count>50)throw Error("Unreviewed sale guard.");
 const at=sql.indexOf(" WHERE "),end=sql.lastIndexOf(" LIMIT 1");if(at<0||end<at)throw Error("Unreviewed sale predicate.");
 return sql.slice(0,at)+" WHERE "+(count?column+" IN ("+Array(count).fill("?").join(",")+")":"0")+" AND ("+sql.slice(at+7,end)+") LIMIT 1";
}
