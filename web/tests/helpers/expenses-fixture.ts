import {seed as seedReturns,database as returnDatabase,credentials,passwords,run,cashDay,signed} from "./returns-fixture";
import {applyExpensesMigration38} from "../../src/server/db/expenses-migrate";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createExpensesService} from "../../src/server/expenses/service";
import {randomUUID} from "node:crypto";
export {passwords,run,cashDay,signed,credentials};
export const seed=seedReturns;
export function database(upgrade=true){const f=returnDatabase();if(upgrade)applyExpensesMigration38(f.db);return {...f,runtime:{...f.runtime,testExpenses:true as const}};}
export async function ready(){const f=database();f.db.close();const g=await openAuthorizationGateway(f.config,38),admin=await credentials(g,f.config,"ADMIN"),staff=await credentials(g,f.config,"SALESPERSON"),api=createExpensesService(g),context=(await api.context(staff,"SALESPERSON")).context;return {...f,g,admin,staff,api,context,async add(amountPaisa="10000",reason="Shop electricity"){const key=randomUUID();await api.prepare(staff,"SALESPERSON",key,"CREATE",{amountPaisa,reason});const s=await api.execute(staff,"SALESPERSON",key,"COUNTER_CASH_TAKEN",cashDay());if(!("expense" in s))throw Error("Expense absent");return {key,expense:s.expense!};}};}
