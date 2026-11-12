import {seed as seedExpenses,database as expensesDatabase,passwords,credentials,cashDay,signed,run} from "./expenses-fixture";
import {applyInvoicesMigration39} from "../../src/server/db/invoices-migrate";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
export {seedExpenses as seed,passwords,credentials,cashDay,signed,run};
export function database(upgrade=true){const f=expensesDatabase();if(upgrade)applyInvoicesMigration39(f.db);return {...f,runtime:{...f.runtime,testInvoiceCorrections:true as const}};}
export async function gateway(){const f=database();f.db.close();const g=await openAuthorizationGateway(f.config,39);return {...f,g,admin:await credentials(g,f.config,"ADMIN"),staff:await credentials(g,f.config,"SALESPERSON")};}

import {createInvoicesService,type CorrectionCommand} from "../../src/server/invoices/service";
import {createInventoryService} from "../../src/server/inventory/service";
import {createReturnsService} from "../../src/server/returns/service";
import {createExpensesService} from "../../src/server/expenses/service";
import {createSalesService} from "../../src/server/sales/service";
import {paidInvoice,unpaidInvoice,productId} from "./returns-fixture";
import {randomUUID} from "node:crypto";
export {paidInvoice,unpaidInvoice,productId};
export async function ready(){const f=await gateway(),api=createInvoicesService(f.g),context=(await api.context(f.admin)).context;return {...f,api,context,inventory:createInventoryService(f.g,39),returns:createReturnsService(f.g,39),expenses:createExpensesService(f.g,39),sales:createSalesService(f.g,"TEST SHOP",39),async command(quantity="2",unitPricePaisa="11000",discountPercent="5",invoiceId=paidInvoice):Promise<CorrectionCommand>{const d=await api.detail(f.admin,invoiceId);return {invoiceId,expectedRevision:d.version,lines:d.lines.map(l=>({saleLineId:l.saleLineId,quantity,unitPricePaisa,discountPercent,physicalQuantity:(BigInt(l.ledgerQuantity)+BigInt(l.quantity)-BigInt(quantity)).toString()})),reason:"Verified incorrect quantity",stockEvidence:"TEST counted actual sellable packs; recorded sale wrong",settlementEvidence:"TEST original settled net and prior adjustments checked",settlementVerified:"YES",cashDate:cashDay(),cashEvidence:"TEST exact actual counter adjustment independently verified",effectiveDate:cashDay()};},async correct(c:CorrectionCommand){const key=randomUUID();await api.prepare(f.admin,passwords.ADMIN,key,context,c);return {key,result:await api.execute(f.admin,key,context,"ACTUAL_STOCK_AND_CASH_VERIFIED",cashDay())};}};}
