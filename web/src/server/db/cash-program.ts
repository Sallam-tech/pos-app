import "server-only";
import {createHash} from "node:crypto";
import {readFileSync,lstatSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {rejectRedirectedPath} from "./location";
import {CASH_OBJECTS} from "./cash-manifest";
export const CASH40_NAME="0040_daily_closing_and_cash.sql", CASH40_HASH="382ec22d06f862d3540ae6179e661cf1513eee4d870cdc40ba232d77617f03c2";
export function cashSteps(){const p=fileURLToPath(new URL("./migrations/"+CASH40_NAME,import.meta.url));rejectRedirectedPath(path.dirname(p));const s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>250000)throw Error();const b=readFileSync(p);if(createHash("sha256").update(b).digest("hex")!==CASH40_HASH)throw Error("Cash migration bytes changed.");const v=b.toString("utf8").split("-- CASH40 STEP\n").slice(1).map(s=>s.trim());if(v.length!==87)throw Error();return v;}
export function cashObjects(){cashSteps();return new Map(Object.entries(CASH_OBJECTS));}
