import {randomUUID} from "node:crypto";
import {beforeAll,afterAll,it,expect} from "vitest";
import {seed,database,credentials,productId,paidInvoice} from "../helpers/returns-fixture";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import type {AuthorizationGateway} from "../../src/server/auth/types";
import {createInventoryService} from "../../src/server/inventory/service";
import {createSalesService} from "../../src/server/sales/service";
import {createReturnsService} from "../../src/server/returns/service";

// Return & Refund search: bill number, product name/code/size/barcode, customer name/phone and
// sale date all find the original bill, and every product on it is listed for return.
let g:AuthorizationGateway,api:ReturnType<typeof createReturnsService>,staff:Request,customerBill:string;
const find=async(query:string)=>(await api.invoices(staff,"SALESPERSON",query)).items;

beforeAll(async()=>{
 await seed();const {config,db}=database();db.close();
 g=await openAuthorizationGateway(config,37);
 const admin=await credentials(g,config,"ADMIN");staff=await credentials(g,config,"SALESPERSON");
 const milk=await createInventoryService(g,37).createProduct(admin,{requestKey:randomUUID(),code:"MP-400",name:"Milk Powder",sizeLabel:"400 g",barcode:"8961234567890",unit:"PACK",buyingPricePaisa:"50000",sellingPricePaisa:"60000",sellingActive:true,openingQuantity:"20",lowStockThreshold:"1"});
 const sales=createSalesService(g,"TEST SHOP",37),context=(await sales.context(staff)).context;
 customerBill=(await sales.create(staff,{requestKey:randomUUID(),context,lines:[{productId:milk.product.id,quantity:"2",unitPricePaisa:"60000",discountPercent:"0"},{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"200000",customerName:"Ayesha Khan",customerPhone:"0300-1234567"})).id;
 api=createReturnsService(g);
},180000);
afterAll(async()=>{await g?.close();});

it("finds the bill by product code, size, barcode or name and marks only the matching product",async()=>{
 for(const q of ["mp-400","MP-4","400 g","8961234567890","milk powder"]){
  const results=await find(q);expect(results.map(x=>x.invoiceId),q).toEqual([customerBill]);
  expect(results[0].lines.filter(l=>l.matched).map(l=>l.name),q).toEqual(["Milk Powder"]);
 }
 const [bill]=await find("mp-400");
 expect(bill.lines.map(l=>[l.name,l.code,l.sizeLabel,l.quantity,l.remainingQuantity])).toEqual([["Milk Powder","MP-400","400 g","2","2"],["TEST return product",expect.any(String),null,"1","1"]]);
});

it("finds the bill by customer name or phone in any common format, without marking products",async()=>{
 for(const q of ["ayesha","KHAN","0300-1234567","03001234567","0300 123 4567"]){
  const results=await find(q);expect(results.map(x=>x.invoiceId),q).toEqual([customerBill]);
  expect(results[0].lines.some(l=>l.matched),q).toBe(false);
 }
 const [bill]=await find("ayesha");expect(bill.customerName).toBe("Ayesha Khan");expect(bill.customerPhone).toBe("0300-1234567");
});

it("finds bills by sale date written day-first, ISO or as a month",async()=>{
 const bill=(await find("")).find(x=>x.invoiceId===customerBill)!,[y,m,d]=bill.businessDate.split("-");
 for(const q of [bill.businessDate,`${d}/${m}/${y}`,`${Number(d)}-${Number(m)}-${y}`,`${y}-${m}`])expect((await find(q)).map(x=>x.invoiceId),q).toContain(customerBill);
 expect((await find(`${d}/${m}/${Number(y)-1}`)).map(x=>x.invoiceId)).not.toContain(customerBill);
});

it("keeps the old behaviour: empty search lists every bill, bill number search works, no match is empty",async()=>{
 const all=await find(""),ids=all.map(x=>x.invoiceId);for(const id of [customerBill,paidInvoice])expect(ids).toContain(id);
 const paid=all.find(x=>x.invoiceId===paidInvoice)!;
 expect((await find(paid.invoiceNumber.slice(-12).toUpperCase())).map(x=>x.invoiceId)).toEqual([paidInvoice]);
 expect(await find("zz-no-such-thing")).toEqual([]);
});

it("results carry only public sale fields for the Salesperson: no cost, profit, stock or barcode",async()=>{
 const all=await find("");expect(all.length).toBeGreaterThanOrEqual(3);
 for(const bill of all){
  expect(Object.keys(bill).sort()).toEqual(["businessDate","customerName","customerPhone","invoiceId","invoiceNumber","lines","paymentRecorded"]);
  for(const l of bill.lines)expect(Object.keys(l).sort()).toEqual(["code","matched","name","paidPaisa","quantity","remainingQuantity","saleLineId","sizeLabel","unitPayablePaisa"]);
 }
 expect(JSON.stringify(all)).not.toMatch(/cost|cogs|profit|stock|balance|8961234567890/i);
});
