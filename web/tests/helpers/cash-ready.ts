import {gateway as base,seed,passwords,cashDay} from "./cash-fixture";
import {createCashService,type CashAction} from "../../src/server/cash/service";
import {createSalesService} from "../../src/server/sales/service";
import {createExpensesService} from "../../src/server/expenses/service";
import {randomUUID} from "node:crypto";
export {seed,passwords,cashDay};
export async function ready(){
 const f=await base(),cash=createCashService(f.g,"TEST SHOP"),context=(await cash.context(f.admin)).context,sales=createSalesService(f.g,"TEST SHOP",40),expenses=createExpensesService(f.g,40);
 async function act(action:CashAction,input:unknown,key=randomUUID()){await cash.prepare(f.admin,passwords.ADMIN,key,context,action,input);const out=await cash.execute(f.admin,key,context,"ADMIN_VERIFIED_CASH_FACTS");if(out.state!=="COMMITTED")throw Error("Cash action not committed");return {key,result:out.result as Record<string,unknown>};}
 async function count(date:string,actualPaisa:string){const s=await act("START_COUNT",{businessDate:date,evidence:"TEST verified no unposted physical movements"});const c=await act("RECORD_COUNT",{sessionId:s.result.sessionId,actualPaisa,evidence:"TEST independently physically counted banknotes"});return {session:s.result.sessionId as string,countId:c.result.countId as string,result:c.result,key:c.key};}
 async function opening(amountPaisa:string,untouched=false){const c=await count(cashDay(),amountPaisa);await act("OPEN_ANCHOR",{countId:c.countId,untouchedOpening:untouched?"YES":"NO",evidence:"TEST verified physical starting cash; prior unknown period retained"});return c;}
 async function sale(productId:string,quantity="1",price="11000"){const key=randomUUID(),c={requestKey:key,context:(await sales.context(f.staff)).context,lines:[{productId,quantity,unitPricePaisa:price,discountPercent:"0"}],cashPaisa:(BigInt(price)*BigInt(quantity)).toString(),cashDate:cashDay(),customerName:"",customerPhone:""};await cash.admit(f.staff,"SALESPERSON",{kind:"SALE",key,input:c});return {key,command:c,receipt:await sales.create(f.staff,c)};}
 async function expense(amountPaisa="1000"){const key=randomUUID();await expenses.prepare(f.staff,"SALESPERSON",key,"CREATE",{amountPaisa,reason:"TEST genuine shop expense"});const result=await expenses.execute(f.staff,"SALESPERSON",key,"COUNTER_CASH_TAKEN",cashDay());return {key,result};}
 return {...f,cash,context,sales,expenses,act,count,opening,sale,expense};
}
