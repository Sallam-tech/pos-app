import "server-only";
import path from "node:path";
import {readProtectedRootAuthority} from "../bootstrap/root-authority";
import {readProtectedCandidateLedger,classifyCandidateLedger,candidatePendingCompatible} from "../bootstrap/candidate-records";
import {rejectBootstrap} from "../bootstrap/windows";
import {rejectRedirectedPath} from "../db/location";
import type {LocalKeyConfiguration} from "../bootstrap/keys";
// Directory names are a fixed desktop convention, never an authority. The
// subsequent selected admission independently validates native file/vault/state,
// enrollment history, fresh key lineage and retirement under the genuine lease.
type InspectionStage="CURRENT_ROOT_AUTHORITY"|"CURRENT_CANDIDATE_LEDGER"|"CURRENT_ROUTING_CHECK";
async function readDesktopSnapshot(root:LocalKeyConfiguration,onStage?:(stage:InspectionStage)=>void){
 onStage?.("CURRENT_ROOT_AUTHORITY");const authority=await readProtectedRootAuthority(root);
 onStage?.("CURRENT_CANDIDATE_LEDGER");const ledger=await readProtectedCandidateLedger(authority.vault,authority.originalAnchorDigest);
 onStage?.("CURRENT_ROUTING_CHECK");return {ledger,state:classifyCandidateLedger(ledger)};
}
type Snapshot=Awaited<ReturnType<typeof readDesktopSnapshot>>;
function currentFromSnapshot(root:LocalKeyConfiguration,{ledger,state}:Snapshot){
 if(!candidatePendingCompatible(ledger)||!["ABSENT","QUARANTINED_ONLY","RECORDED_CURRENT"].includes(state.status))return rejectBootstrap();
 const current=state.recordedCurrent;if(!current)return Object.freeze({active:root,generation:"ROOT",selected:false,backupName:"b"});
 if(current.purpose!=="RESTORE41"||! /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(current.operationId)||! /^[1-9][0-9]{0,8}$/.test(current.generation))return rejectBootstrap();
 const directory=path.join(path.dirname(root.directory),current.operationId);rejectRedirectedPath(directory);
 const active:LocalKeyConfiguration={directory,database:{directory,filename:"restored41.sqlite3",mode:"test",create:false},migrationsDirectory:root.migrationsDirectory};
 return Object.freeze({active,generation:current.generation,selected:true,backupName:"b"+current.generation});
}
function reviewFromSnapshot(root:LocalKeyConfiguration,{ledger,state}:Snapshot){
 if(state.status!=="RECOVERY_REVIEW_REQUIRED")return undefined;
 const last=ledger.records.at(-1);if(ledger.pending.length||!last||!["INTENT","COMMITTED"].includes(last.kind)||last.purpose!=="RESTORE41"||!candidatePendingCompatible(ledger,last.operationId))return rejectBootstrap();
 const previous=state.recordedCurrent,sourceDirectory=previous?path.join(path.dirname(root.directory),previous.operationId):root.directory;
 if(previous?.purpose&&previous.purpose!=="RESTORE41")return rejectBootstrap();rejectRedirectedPath(sourceDirectory);
 const source:LocalKeyConfiguration=previous?{directory:sourceDirectory,database:{directory:sourceDirectory,filename:"restored41.sqlite3",mode:"test",create:false},migrationsDirectory:root.migrationsDirectory}:root;
 const directory=path.join(path.dirname(root.directory),last.operationId);rejectRedirectedPath(directory);
 return Object.freeze({operationId:last.operationId,kind:last.kind as "INTENT"|"COMMITTED",source,selectedSource:!!previous,target:{directory,database:{directory,filename:"restored41.sqlite3",mode:"test" as const,create:false},migrationsDirectory:root.migrationsDirectory},record:last});
}
export async function resolveDesktopCurrent(root:LocalKeyConfiguration,onStage?:(stage:InspectionStage)=>void){return currentFromSnapshot(root,await readDesktopSnapshot(root,onStage));}
export async function inspectDesktopRecoveryReview(root:LocalKeyConfiguration){return reviewFromSnapshot(root,await readDesktopSnapshot(root));}
// One fresh routing snapshot, never a writer authority or a cached verdict.
// A reviewed recovery must finish before a second, freshly verified selection;
// protected root/selected admission still independently rechecks under its lease.
export async function inspectDesktopStartup(root:LocalKeyConfiguration,onStage?:(stage:InspectionStage)=>void){
 const snapshot=await readDesktopSnapshot(root,onStage),review=reviewFromSnapshot(root,snapshot);
 return review?Object.freeze({kind:"REVIEW" as const,review}):Object.freeze({kind:"CURRENT" as const,current:currentFromSnapshot(root,snapshot)});
}
