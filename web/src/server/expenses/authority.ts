import "server-only";
import type {Actor,AuthorizedTransaction} from "../auth/types";
import {int64} from "../db/integers";
type Tx=AuthorizedTransaction;
const one=BigInt(1),big=(v:unknown)=>{if(typeof v!=="bigint")throw Error("Authority unavailable.");return int64(v);};
const deny=(code:string):never=>{void code;throw Error("Authority unavailable.");};
const clocks=new Map<string,{wall:number;tick:number;origin:number;start:number}>();
export async function expenseBinding(tx:Tx,a:Actor){
 const r=await tx.get("SELECT s.*,p.active,p.credential_version AS current_version,p.auth_epoch AS current_epoch FROM auth_session_authorizations s JOIN auth_principals p ON p.id=s.principal_id WHERE s.session_id=? AND p.id=?",[a.sessionId,a.principalId]);
 const wall=Date.now(),tick=Math.floor(performance.now());
 if(!Number.isSafeInteger(wall)||!Number.isSafeInteger(tick)||wall<=0||tick<0)return deny("UNAVAILABLE");
 if(!r||r.active!==one||r.revoked_at_ms!==null||r.credential_version!==r.current_version||r.auth_epoch!==r.current_epoch)return deny("CONFLICT");
 const boot=String(r.boot_generation),old=clocks.get(boot);
 if(old&&(wall<old.wall||tick<old.tick))return deny("UNAVAILABLE");
 const state=old??{wall,tick,origin:wall,start:tick};state.wall=wall;state.tick=tick;clocks.set(boot,state);if(clocks.size>8)clocks.delete(clocks.keys().next().value!);
 const now=int64(BigInt(Math.max(wall,state.origin+tick-state.start)));
 if(big(r.expires_at_ms)<=now||big(r.created_at_ms)>now)return deny("CONFLICT");
 return {now,boot,credential_version:big(r.credential_version),auth_epoch:big(r.auth_epoch),expires_at_ms:big(r.expires_at_ms)};
}
