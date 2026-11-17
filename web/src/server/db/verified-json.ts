import "server-only";
import {hash} from "node:crypto";
import {canonical} from "../inventory/validation";
// Check every byte/hash on every read. This caches neither data nor validation.
// Canonical persisted JSON can be hashed directly after checking its key order;
// legacy noncanonical receipts retain the original canonical-hash semantics.
function ordered(value:unknown):boolean{
 if(!value||typeof value!=="object")return true;
 if(Array.isArray(value))return value.every(ordered);
 let previous:string|undefined;
 for(const key of Object.keys(value)){
  const n=Number(key),index=Number.isInteger(n)&&n>=0&&n<4294967295&&String(n)===key;
  if(!index){if(previous!==undefined&&previous>key)return false;previous=key;}
  if(!ordered((value as Record<string,unknown>)[key]))return false;
 }
 return true;
}
export function verifiedJson(encoded:unknown,checksum:unknown,requireCanonical=false):unknown{
 if(typeof encoded!=="string"||typeof checksum!=="string")throw Error("Immutable JSON unavailable.");
 const value:unknown=JSON.parse(encoded),fast=JSON.stringify(value)===encoded&&ordered(value);
 if(requireCanonical&&!fast)throw Error("Immutable JSON unavailable.");
 const bytes=fast?encoded:canonical(value);
 if(hash("sha256",bytes,"hex")!==checksum)throw Error("Immutable JSON unavailable.");
 return value;
}
