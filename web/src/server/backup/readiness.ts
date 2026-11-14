import "server-only";
import type {DatabaseOptions} from "../db/location";
import {resolveDatabaseLocation} from "../db/location";
import {openProofDatabase,verifySchema41} from "./snapshot";
// Diagnostic only: never a setup, migration, credential or activation capability.
export async function inspectTestSchema41Readiness(database:DatabaseOptions){
 try{
  if(database.mode!=="test")throw Error();const db=openProofDatabase(resolveDatabaseLocation({...database,create:false}).filename);
  try{await verifySchema41(db);
   return Object.freeze({schema:41,schemaStatus:"VERIFIED_TEST_ONLY",productionActivation:false,upgradeAuthorized:false,
    enrollment:"BLOCKED_PROTECTED_SCHEMA41_MAINTENANCE_REQUIRED",accountWriter:"EXISTING_TWO_ACCOUNT_WRITER_ONLY",
    anchors:"ORIGINAL_EIGHT_MIGRATIONS_PRESERVED",ownerCustody:"NOT_VERIFIED",independentRecovery:"NOT_VERIFIED",
    tlsTrust:"TARGET_HARDWARE_NOT_VERIFIED"});
  }finally{db.close();}
 }catch{return Object.freeze({schemaStatus:"REJECTED",productionActivation:false,upgradeAuthorized:false});}
}
