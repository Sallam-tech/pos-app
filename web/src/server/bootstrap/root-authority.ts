import "server-only";
import path from "node:path";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { validateReviewedSchema } from "../db/validate-schema";
import { resolveDatabaseLocation } from "../db/location";
import { enrollmentDigest, readEnrollmentSnapshot } from "./database";
import { classifyEnrollment, readEnrollmentJournal } from "./journal";
import { inspectHistoricalLocalVault, type LocalKeyConfiguration } from "./keys";
import { protectedManifestDigest, readProtectedMaintenance } from "./maintenance-journal";
import { rejectBootstrap } from "./windows";
import type { ProofDatabase } from "../backup/snapshot";
import { readImportedRootProvenance } from "./imported-root41";
const Driver=createRequire(import.meta.url)("better-sqlite3") as new(filename:string,options:{readonly:true;fileMustExist:true})=>ProofDatabase;
// Original ENROLLED and IMPORTED_ROOT have different issuers. Historical records
// remain historical; the imported reader never asks DPAPI to open an old root.
export async function readProtectedRootAuthority(config:LocalKeyConfiguration){
 if(existsSync(path.join(config.directory,"protected-identity","imported-root")))return readImportedRootProvenance(config);
 const vault=await inspectHistoricalLocalVault(config),db=new Driver(resolveDatabaseLocation(config.database).filename,{readonly:true,fileMustExist:true});db.defaultSafeIntegers(true);
 try{
  if((await readProtectedMaintenance(vault)).length)return rejectBootstrap();
  db.exec("BEGIN");const marker=db.prepare("PRAGMA user_version").get()?.user_version;if(marker!==BigInt(8)&&marker!==BigInt(41))return rejectBootstrap();const anchorVersion=Number(marker) as 8|41;
  const records=await readEnrollmentJournal(vault,protectedManifestDigest(anchorVersion));
  const reader={get:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).get(...values),all:async(sql:string,values:readonly import("../db/connection").SqlValue[]=[])=>db.prepare(sql).all(...values)};
  if(!(await validateReviewedSchema(reader,anchorVersion)).ok)return rejectBootstrap();
  const enrolled=classifyEnrollment(records,await readEnrollmentSnapshot(reader,protectedManifestDigest(anchorVersion),anchorVersion));
  if(enrolled.status!=="ENROLLED"||!enrolled.anchor)return rejectBootstrap();db.exec("ROLLBACK");
  return Object.freeze({kind:"ORIGINAL" as const,vault,records,anchorVersion,anchor:enrolled.anchor,originalAnchorDigest:enrollmentDigest(enrolled.anchor),sourceTlsPublicKeyDigests:Object.freeze([vault.tlsPublicKeyDigest]),issuerProofDigest:enrollmentDigest(enrolled.anchor)});
 }finally{db.close();}
}
