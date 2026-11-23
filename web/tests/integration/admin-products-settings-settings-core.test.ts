import {beforeAll,afterEach,test,expect,vi} from "vitest";
import {randomUUID} from "node:crypto";
import {seed,gateway,passwords,credentials,cashDay,settings} from "../helpers/admin-products-settings-fixture";
import {createSettingsService} from "../../src/server/settings/service";
import {createSalesService} from "../../src/server/sales/service";
import {createCashService} from "../../src/server/cash/service";
import {createInventoryService} from "../../src/server/inventory/service";
import {openAuthorizationGateway} from "../../src/server/auth/gateway";
import {productId,paidInvoice} from "../helpers/invoices-fixture";
import {Driver,type Raw} from "../helpers/reports-volume";
beforeAll(seed);afterEach(()=>vi.restoreAllMocks());
test("TEST41 explicit shared settings, versions, concurrent duplicate/stale keys, source-bound branding and immutable old receipts",async()=>{
 const f=await gateway();try{const api=createSettingsService(f.g,"TEST Configured Shop"),first=await api.current(f.admin,"ADMIN");if(!("context" in first))throw Error();const ctx=first.context;if(!ctx)throw Error();
 expect(first.saved).toBeNull();expect(await f.g.publicShopName()).toBeNull();const sale=createSalesService(f.g,"TEST Configured Shop",41),sctx=(await sale.context(f.staff)).context,old=await sale.get(f.staff,paidInvoice);expect(old.branding).toBeUndefined();
 const key=randomUUID(),input={expectedRevision:"0",settings:settings(),reason:"TEST verified first explicit settings"};const saved=await api.save(f.admin,passwords.ADMIN,key,ctx,input);expect(saved.state).toBe("COMMITTED");expect(await api.save(f.admin,passwords.ADMIN,key,ctx,input)).toEqual(saved);await expect(api.save(f.admin,passwords.ADMIN,key,ctx,{...input,reason:"Different request"})).rejects.toThrow();expect(await f.g.publicShopName()).toBe("TEST Explicit Shop");
 const staff=await api.current(f.staff,"SALESPERSON");expect(Object.keys(staff)).toEqual(["settings"]);await expect(api.history(f.staff)).rejects.toThrow();await expect(api.save(f.staff,passwords.ADMIN,randomUUID(),ctx,input)).rejects.toThrow();await expect(api.save(f.admin,passwords.ADMIN,randomUUID(),ctx,input)).rejects.toThrow();
 const cash=createCashService(f.g,"TEST Configured Shop",41),command={requestKey:randomUUID(),context:sctx,lines:[{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:"11000",cashDate:cashDay(),customerName:"",customerPhone:""};
 await cash.admit(f.staff,"SALESPERSON",{kind:"SALE",key:command.requestKey,input:command});
 await api.save(f.admin,passwords.ADMIN,randomUUID(),ctx,{expectedRevision:"1",settings:settings("TEST Later Shop"),reason:"TEST explicit later revision"});
 const receipt=await sale.create(f.staff,command);expect(receipt).toMatchObject({shopName:"TEST Explicit Shop",branding:settings()});expect(await sale.create(f.staff,command)).toEqual(receipt);expect(await sale.get(f.staff,paidInvoice)).toEqual(old);
 const unpaid=await sale.create(f.staff,{...command,requestKey:randomUUID(),cashPaisa:null});expect(unpaid).toMatchObject({shopName:"TEST Later Shop",branding:settings("TEST Later Shop"),payment:null});
 const inventory=createInventoryService(f.g,41),p=await inventory.getProduct(f.admin,{productId});await inventory.changeBuyingCost(f.admin,{requestKey:randomUUID(),productId,expectedProductVersion:p.productVersion,expectedBalanceVersion:p.balanceVersion,buyingPricePaisa:"15000",reason:"TEST actual D05 revaluation",confirmAllRemaining:true});expect(await sale.get(f.staff,receipt.id)).toEqual(receipt);
 expect((await api.history(f.admin)).items.map(x=>x.revision)).toEqual(["2","1"]);
 }finally{await f.g.close();}
},180000);
test("Settings failed effect rolls back all audit; permanent absence fence and original-key restart preserve later revision",async()=>{
 const f=await gateway();let g=f.g;try{let api=createSettingsService(g,"TEST Configured Shop");const c=await api.current(f.admin,"ADMIN");if(!("context"in c))throw Error();const ctx=c.context;if(!ctx)throw Error();const key=randomUUID(),input={expectedRevision:"0",settings:settings(),reason:"TEST failed original revision"};
 const proto=Driver.prototype as Raw,prepare=proto.prepare;vi.spyOn(proto,"prepare").mockImplementation(function(this:Raw,sql:string){const st=prepare.call(this,sql);if(sql.startsWith("INSERT INTO shop_settings_revisions"))st.run=()=>({changes:0,lastInsertRowid:BigInt(0)});return st;});
 await expect(api.save(f.admin,passwords.ADMIN,key,ctx,input)).rejects.toThrow();vi.restoreAllMocks();expect((await api.operation(f.admin,key,ctx,"SETTINGS")).state).toBe("UNKNOWN");expect((await api.cancel(f.admin,passwords.ADMIN,key,ctx,"SETTINGS","TEST independently verified no saved effect")).state).toBe("CANCELLED");await expect(api.save(f.admin,passwords.ADMIN,key,ctx,input)).rejects.toThrow();
 const savedKey=randomUUID(),result=await api.save(f.admin,passwords.ADMIN,savedKey,ctx,input);await api.save(f.admin,passwords.ADMIN,randomUUID(),ctx,{...input,expectedRevision:"1",settings:settings("TEST Subsequent"),reason:"TEST next explicit version"});await g.close();g=await openAuthorizationGateway(f.config,41);const admin=await credentials(g,f.config,"ADMIN");api=createSettingsService(g,"TEST Configured Shop");expect(await api.operation(admin,savedKey,ctx,"SETTINGS")).toEqual(result);const current=await api.current(admin,"ADMIN");expect("saved"in current&&current.saved?.settings.shopName).toBe("TEST Subsequent");
 }finally{await g.close();}
},180000);
test("both password controls use atomic version audit, target revocation and fresh-login original-key recovery",async()=>{
 const f=await gateway();let g=f.g;try{let api=createSettingsService(g,"TEST Configured Shop");const c=await api.current(f.admin,"ADMIN");if(!("context"in c))throw Error();const ctx=c.context;if(!ctx)throw Error();const staffKey=randomUUID(),newStaff=randomUUID()+"Staff";
 await api.password(f.admin,passwords.ADMIN,staffKey,ctx,"SALESPERSON",newStaff);await expect(g.authorizeSalesperson(f.staff)).rejects.toThrow();await expect(g.verifySalespersonPassword(passwords.SALESPERSON)).rejects.toThrow();const staffProof=await g.verifySalespersonPassword(newStaff);expect((await g.issueSalespersonSession(staffProof)).status).toBe(200);expect((await api.operation(f.admin,staffKey,ctx,"PASSWORD_SALESPERSON")).state).toBe("COMMITTED");await expect(api.password(f.admin,passwords.ADMIN,staffKey,ctx,"SALESPERSON",randomUUID())).rejects.toThrow();
 const adminKey=randomUUID(),newAdmin=randomUUID()+"Admin";await api.password(f.admin,passwords.ADMIN,adminKey,ctx,"ADMIN",newAdmin);await expect(g.authorizeAdmin(f.admin)).rejects.toThrow();await g.close();g=await openAuthorizationGateway(f.config,41);const proof=await g.verifyAdminPassword(newAdmin),issued=await g.issueAdminSession(proof),cookie=issued.headers.getSetCookie().map(v=>v.split(";")[0]).join("; "),admin=new Request(f.config.origins.ADMIN+"/api/admin/settings",{headers:{cookie,origin:f.config.origins.ADMIN}});api=createSettingsService(g,"TEST Configured Shop");expect((await api.operation(admin,adminKey,ctx,"PASSWORD_ADMIN")).state).toBe("COMMITTED");
 const rows=await g.withAdminTransaction(admin,tx=>tx.all("SELECT * FROM shop_password_operations"));expect(rows).toHaveLength(2);expect(Object.keys(rows[0]).some(k=>/hash|password|token/.test(k))).toBe(false);
 }finally{await g.close();}
},180000);


test("owner-approved ordinary shop settings require signed Admin, audit automatically and retain password/recovery protection",async()=>{
 const f=await gateway();try{
  const repeatPassword=vi.fn(async()=>{throw Error("Routine settings must not request password again");});
  const api=createSettingsService({...f.g,verifyAdminPassword:repeatPassword},"TEST SHOP"),current=await api.current(f.admin,"ADMIN");if(!current.context)throw Error();
  const key=randomUUID(),input={expectedRevision:"0",settings:settings()};
  await expect(api.save(f.staff,undefined,key,current.context,input)).rejects.toThrow();
  await expect(api.save(new Request(f.admin.url),undefined,key,current.context,input)).rejects.toThrow();
  expect((await api.operation(f.admin,key,current.context,"SETTINGS")).state).toBe("UNKNOWN");
  const saved=await api.save(f.admin,undefined,key,current.context,input);expect(saved.state).toBe("COMMITTED");
  expect(await api.save(f.admin,undefined,key,current.context,input)).toEqual(saved);
  const history=await api.history(f.admin);expect(history.items).toHaveLength(1);expect(history.items[0].reason).toBe("Shop and receipt details updated by signed-in Admin");
  expect(repeatPassword).not.toHaveBeenCalled();
  await expect(api.password(f.admin,undefined,randomUUID(),current.context,"SALESPERSON","new-test-password")).rejects.toThrow();
  await expect(api.cancel(f.admin,undefined,randomUUID(),current.context,"SETTINGS","No effect verified")).rejects.toThrow();
 }finally{await f.g.close();}
},180000);
