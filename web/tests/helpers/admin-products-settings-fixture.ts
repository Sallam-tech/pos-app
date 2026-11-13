import {database as cashDatabase,seed,passwords,credentials,cashDay,run} from "./cash-fixture";
import {applySettingsMigration41} from "../../src/server/db/settings-migrate";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
export {seed,passwords,credentials,cashDay,run};
export function database(){const f=cashDatabase();applySettingsMigration41(f.db);return {...f,runtime:{...f.runtime,testSettings:true as const}};}
export async function gateway(){const f=database();f.db.close();const g=await openAuthorizationGateway(f.config,41);return {...f,g,admin:await credentials(g,f.config,"ADMIN"),staff:await credentials(g,f.config,"SALESPERSON")};}
export const settings=(shopName="TEST Explicit Shop")=>({shopName,address:"TEST Recorded Address",phone:"0300-1234567",footer:"TEST Saved Message",receiptLayout:"compact" as const,currency:"PKR" as const,timezone:"Asia/Karachi" as const});
