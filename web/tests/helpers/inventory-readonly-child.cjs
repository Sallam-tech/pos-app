// TEST-only independent-process persistence check; never opens a writer or handles credentials.
void import("better-sqlite3").then(({default:Database})=>{
const db=new Database(process.argv[2],{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);
try {
 const row=db.prepare("SELECT sellable_q,stock_value_m FROM stock_balances WHERE product_id=?").get(process.argv[3]);
 const n=db.prepare("SELECT count(*) AS n FROM stock_movements WHERE product_id=?").get(process.argv[3]).n;
 process.stdout.write(JSON.stringify({quantityQ:String(row.sellable_q),stockValuePaisa:String(row.stock_value_m),movements:String(n),schemaVersion:String(db.pragma("user_version",{simple:true}))}));
} finally {db.close();}
});
