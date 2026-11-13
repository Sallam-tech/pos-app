import {expenseDay} from "../../src/server/expenses/calendar";
import {seed,database as previous,credentials,passwords,run,signed} from "./invoices-fixture";
import {applyCashMigration40} from "../../src/server/db/cash-migrate";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
export {seed,credentials,passwords,run,signed};
export function database(upgrade=true){const f=previous();if(upgrade)applyCashMigration40(f.db);return {...f,runtime:{...f.runtime,testReports:true as const,testCash:true as const}};}
export async function gateway(){const f=database();f.db.close();const g=await openAuthorizationGateway(f.config,40);return {...f,g,admin:await credentials(g,f.config,"ADMIN"),staff:await credentials(g,f.config,"SALESPERSON")};}

export const cashDay=()=>expenseDay();
