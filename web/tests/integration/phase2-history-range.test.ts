import {beforeAll,test,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import * as dates from "../../src/lib/sales/history-range";
import {seed,database,credentials} from "../helpers/returns-fixture";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createInventoryService} from "../../src/server/inventory/service";
import {createSalesService} from "../../src/server/sales/service";
beforeAll(seed);
test("90 inclusive Karachi dates preserve leap/year and midnight boundaries",()=>{
 expect(dates.recentSalesRange(Date.parse("2026-11-15T19:00:00Z"))).toEqual({from:"2026-08-19",to:"2026-11-16"});
 expect(dates.recentSalesRange(Date.parse("2026-11-15T18:59:59Z"))).toEqual({from:"2026-08-18",to:"2026-11-15"});
 expect(dates.recentSalesRange(Date.parse("2024-03-30T19:00:00Z"))).toEqual({from:"2024-01-02",to:"2024-03-31"});
 expect(dates.recentSalesRange(Date.parse("2026-01-01T00:00:00Z"))).toEqual({from:"2025-10-04",to:"2026-01-01"});
});
test("genuine history defaults to recent dates; explicit old history/search stays authorized and retained",async()=>{
 const f=database(false);f.db.close();const g=await openAuthorizationGateway(f.config,36);
 try{
  const admin=await credentials(g,f.config,"ADMIN"),staff=await credentials(g,f.config,"SALESPERSON"),inventory=createInventoryService(g,36),sales=createSalesService(g,"TEST SHOP",36);
  const p=await inventory.createProduct(admin,{requestKey:randomUUID(),name:"Retained history",unit:"PACK",buyingPricePaisa:"10000",sellingPricePaisa:"11000",sellingActive:true,openingQuantity:"2",lowStockThreshold:"1"});
  const receipt=await sales.create(staff,{requestKey:randomUUID(),context:(await sales.context(staff)).context,lines:[{productId:p.product.id,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"11000"});
  const retainedBefore=await g.withAdminTransaction(admin,tx=>tx.get("SELECT count(*) AS n FROM sales"));
  expect((await sales.history(staff)).items.map(v=>v.id)).toContain(receipt.id);
  // Move ONLY the default view boundary, keeping real sessions, SQL and accounting unchanged.
  vi.spyOn(dates,"recentSalesRange").mockReturnValue({from:"2099-01-01",to:"2099-03-31"});
  expect((await sales.history(staff)).items).toEqual([]);
  expect((await sales.history(staff,undefined,receipt.number)).items.map(v=>v.id)).toContain(receipt.id);
  expect((await sales.history(staff,undefined,"",{from:receipt.businessDate,to:receipt.businessDate})).items.map(v=>v.id)).toContain(receipt.id);
  await expect(sales.history(staff,undefined,"",{from:"2026-02-30",to:"2026-03-01"})).rejects.toThrow();
  await expect(sales.history(staff,undefined,"",{from:"2026-03-02",to:"2026-03-01"})).rejects.toThrow();
  await expect(sales.history(admin,undefined,receipt.number)).rejects.toThrow();
  await expect(sales.history(new Request(f.config.origins.SALESPERSON+"/history"),undefined,receipt.number)).rejects.toThrow();
  expect(await sales.get(staff,receipt.id)).toEqual(receipt);
  expect(await g.withAdminTransaction(admin,tx=>tx.get("SELECT count(*) AS n FROM sales"))).toEqual(retainedBefore);
 }finally{vi.restoreAllMocks();await g.close();}
});