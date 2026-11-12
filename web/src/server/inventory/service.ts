import "server-only";
import type { Actor, AuthorizationGateway, AuthorizedTransaction } from "../auth/types";
import { InventoryError, type Kind } from "./contracts";
import { validateReviewedSchema } from "../db/validate-schema";
import { committedInventoryResult, inventoryKind, recoverInventoryOperation } from "./recovery";
import { load } from "./model";
import { mutate } from "./mutations";
import { events, list, movements } from "./reads";
import { object, reject, uuid } from "./validation";
// Trusted server composition only. Requests never supply an actor, transaction or verifier.
// Every method, including idempotent replay and reads, enters the SAME mandatory SQL gateway.
export function createInventoryService(gateway: AuthorizationGateway, schema:35|36|37|38|39=35) {
 if(!gateway || typeof gateway.withAdminTransaction!=="function") return reject("UNAVAILABLE");
 const authorize=gateway.withAdminTransaction.bind(gateway);
 async function execute<T>(request:Request,work:(tx:AuthorizedTransaction,actor:Actor)=>Promise<T>):Promise<T> {
  let domain:InventoryError|undefined;
  try {
   return await authorize(request,async(tx,actor)=>{
    try {
     if(actor.role!=="ADMIN" || actor.principalId!=="ADMIN" || !(await validateReviewedSchema(tx,schema)).ok) return reject("UNAVAILABLE");
     return await work(tx,actor);
    } catch(error) { if(error instanceof InventoryError) domain=error;throw error; }
   });
  } catch {throw domain??new InventoryError("UNAVAILABLE");}
 }
 const change=(kind:Kind)=>(request:Request,input:unknown)=>execute(request,(tx,actor)=>mutate(tx,actor,kind,input));
 return Object.freeze({
  createProduct:change("CREATE"),updateProduct:change("EDIT"),setSellingPrice:change("SELLING_PRICE"),
  setSellingStatus:change("STATUS"),archiveProduct:change("ARCHIVE"),changeBuyingCost:change("REPRICE"),
  receiveStock:change("RECEIVE"),correctStock:change("ADJUST"),
  // Bounded reconciliation of an uncertain HTTP mutation. A request key is NOT
  // authority: this read uses the same signed-session/SQLite Admin transaction.
  getOperationResult:(request:Request,input:unknown)=>execute(request,async (tx,actor)=>{
   const o=object(input,["requestKey"]), key=uuid(o.requestKey);
   const row=await tx.get("SELECT id,product_id,kind,result_json FROM inventory_operations WHERE request_key=?",[key]);
   if(!row || (row.kind!=="CREATE" && row.kind!=="RECEIVE")) return reject("NOT_FOUND");
   if (await tx.get("SELECT request_key FROM inventory_cancellations WHERE request_key=?", [key])) return reject("UNAVAILABLE");
   return committedInventoryResult(tx,actor,key,inventoryKind(row.kind));
  }),
  getRecovery:(request:Request,input:unknown)=>execute(request,(tx,actor)=>recoverInventoryOperation(tx,actor,input,false)),
  resolveOrCancel:(request:Request,input:unknown)=>execute(request,(tx,actor)=>recoverInventoryOperation(tx,actor,input,true)),
  getProduct:(request:Request,input:unknown)=>execute(request,async tx=>{
   const o=object(input,["productId"]);return (await load(tx,uuid(o.productId))).dto;
  }),
  listProducts:(request:Request,input:unknown)=>execute(request,tx=>list(tx,input)),
  listMovements:(request:Request,input:unknown)=>execute(request,tx=>movements(tx,input)),
  listProductEvents:(request:Request,input:unknown)=>execute(request,tx=>events(tx,input)),
 });
}
