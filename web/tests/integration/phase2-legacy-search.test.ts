import {beforeAll,test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import {seed,database,credentials} from "../helpers/returns-fixture";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {createInventoryService} from "../../src/server/inventory/service";
import {createSalesService} from "../../src/server/sales/service";
import {createReturnsService} from "../../src/server/returns/service";
beforeAll(seed);
test.each([36,37] as const)("schema%i retains genuine Unicode snapshot search without changing historical schema",async schema=>{
 const f=database(schema===37);f.db.close();const g=await openAuthorizationGateway(f.config,schema);
 try{
  const admin=await credentials(g,f.config,"ADMIN"),staff=await credentials(g,f.config,"SALESPERSON"),inventory=createInventoryService(g,schema),sales=createSalesService(g,"TEST SHOP",schema);
  const p=await inventory.createProduct(admin,{requestKey:randomUUID(),name:"ÄPFEL دودھ",unit:"PACK",buyingPricePaisa:"10000",sellingPricePaisa:"11000",sellingActive:true,openingQuantity:"2",lowStockThreshold:"1"});
  const receipt=await sales.create(staff,{requestKey:randomUUID(),context:(await sales.context(staff)).context,lines:[{productId:p.product.id,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"11000"});
  expect((await sales.history(staff,undefined,"äpfel")).items.map(v=>v.id)).toContain(receipt.id);
  expect((await sales.history(staff,undefined,receipt.number.toLowerCase())).items.map(v=>v.id)).toContain(receipt.id);
  if(schema===37)expect((await createReturnsService(g,37).invoices(staff,"SALESPERSON","äpfel")).items.map(v=>v.invoiceId)).toContain(receipt.id);
  expect(await g.withAdminTransaction(admin,tx=>tx.get("SELECT user_version AS version FROM pragma_user_version"))).toEqual({version:BigInt(schema)});
 }finally{await g.close();}
});