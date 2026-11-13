import {beforeAll,test,expect} from "vitest";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {seed,gateway,passwords,settings} from "../helpers/admin-products-settings-fixture";
import {createSettingsService} from "../../src/server/settings/service";
import {createSalesService} from "../../src/server/sales/service";
import {productId} from "../helpers/invoices-fixture";
import {Driver} from "../helpers/reports-volume";
import {SETTINGS_TABLES} from "../../src/server/db/settings-manifest";
import {stable} from "../helpers/inventory-http-fixture";
beforeAll(seed);
test("all five actual SQLite histories reject update/delete/REPLACE/UPSERT/hidden-rowid conflicts with recursive triggers OFF and ON",async()=>{
 const f=await gateway();try{const api=createSettingsService(f.g,"TEST SHOP"),v=await api.current(f.admin,"ADMIN");if(!v.context)throw Error();const ctx=v.context;await api.save(f.admin,passwords.ADMIN,randomUUID(),ctx,{expectedRevision:"0",settings:settings(),reason:"TEST guard source"});await api.cancel(f.admin,passwords.ADMIN,randomUUID(),ctx,"SETTINGS","TEST positively verified no-effect source");
 const sales=createSalesService(f.g,"TEST SHOP",41),context=(await sales.context(f.staff)).context;await sales.create(f.staff,{requestKey:randomUUID(),context,lines:[{productId,quantity:"1",unitPricePaisa:"11000",discountPercent:"0"}],cashPaisa:null,customerName:"",customerPhone:""});await api.password(f.admin,passwords.ADMIN,randomUUID(),ctx,"SALESPERSON",randomUUID()+"Staff");await f.g.close();
 const raw=new Driver(path.join(f.config.database.directory,"test.sqlite3"));try{raw.defaultSafeIntegers(true);raw.exec("PRAGMA foreign_keys=ON");
 for(const mode of ["OFF","ON"]){raw.exec("PRAGMA recursive_triggers="+mode);for(const table of SETTINGS_TABLES){const row=raw.prepare("SELECT rowid,* FROM "+table+" LIMIT 1").get();expect(row,table).toBeTruthy();const before=stable(raw.prepare("SELECT rowid,* FROM "+table+" ORDER BY rowid").all()),cols=Object.keys(row!).filter(k=>k!=="rowid"),names=cols.join(",");
 for(const sql of ["UPDATE "+table+" SET "+cols[0]+"="+cols[0],"DELETE FROM "+table,"INSERT OR REPLACE INTO "+table+"(rowid,"+names+") SELECT rowid,"+names+" FROM "+table+" LIMIT 1","INSERT INTO "+table+"("+names+") SELECT "+names+" FROM "+table+" WHERE 1 ON CONFLICT DO UPDATE SET "+cols[0]+"=excluded."+cols[0],"INSERT INTO "+table+"(rowid,"+names+") SELECT rowid,"+names+" FROM "+table+" LIMIT 1"])expect(()=>raw.exec(sql),table+" "+sql).toThrow(/Settings history/);
 expect(stable(raw.prepare("SELECT rowid,* FROM "+table+" ORDER BY rowid").all())).toBe(before);
 }}expect(raw.pragma("foreign_key_check")).toEqual([]);
 }finally{raw.close();}
 }finally{await f.g.close();}
},180000);
