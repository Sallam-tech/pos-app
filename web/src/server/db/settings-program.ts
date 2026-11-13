import "server-only";
import {createHash} from "node:crypto";
import {readFileSync,lstatSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {rejectRedirectedPath} from "./location";
import {SETTINGS_OBJECTS} from "./settings-manifest";
export const SETTINGS41_NAME="0041_admin_products_and_settings.sql", SETTINGS41_HASH="552fd86ef14c1eb2bf98a2d104ebbbfcb3e8eefd84b7ca4b967853c0a7e40211";
export function settingsSteps(){const p=fileURLToPath(new URL("./migrations/"+SETTINGS41_NAME,import.meta.url));rejectRedirectedPath(path.dirname(p));const s=lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.size>250000)throw Error();const b=readFileSync(p);if(createHash("sha256").update(b).digest("hex")!==SETTINGS41_HASH)throw Error("Settings migration bytes changed.");const v=b.toString("utf8").split("-- SETTINGS41 STEP\n").slice(1).map(s=>s.trim());if(v.length!==27)throw Error();return v;}
export function settingsObjects(){settingsSteps();return new Map(Object.entries(SETTINGS_OBJECTS));}
