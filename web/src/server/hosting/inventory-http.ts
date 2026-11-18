import "server-only";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthorizationGateway } from "../auth/types";
import { validateReviewedSchema } from "../db/validate-schema";
import { object } from "../inventory/validation";
import { inventoryKind } from "../inventory/recovery";
import { InventoryError } from "../inventory/contracts";
import { createInventoryService } from "../inventory/service";
import { inventoryRecoveryContext } from "./inventory-recovery-context";
import type { LocalRequestContext } from "./https";

const id = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const operationRoute = new RegExp("^/api/admin/inventory/operations/(" + id + ")$");
const recoveryRoute = new RegExp("^/api/admin/inventory/operations/(" + id + ")/recovery$");
const route = new RegExp("^/api/admin/products(?:/(" + id + ")(/(?:receive|edit|selling-price|status|archive|reprice|adjust|events|movements))?)?$");
export function isInventoryApiPath(url: string) {
  const pathname = url.split("?")[0];
  return pathname === "/api/admin/inventory/recovery-context" || pathname === "/api/admin/inventory" || route.test(pathname) || operationRoute.test(pathname) || recoveryRoute.test(pathname);
}
const failed = () => new Error("Inventory unavailable.");
function send(response: ServerResponse, status: number, body: unknown, allow?: string) {
  if (response.destroyed || response.headersSent) { response.destroy(); return; }
  if (allow) response.setHeader("Allow", allow);
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store, private",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", Connection: "close" });
  response.end(JSON.stringify(body));
}
export function inventoryRequestHeaders(request: IncomingMessage, context: LocalRequestContext, mutation: boolean, navigation = false, fixedRole: "ADMIN" | "SALESPERSON" = "ADMIN", bodyLimit=8192) {
  const names = request.rawHeaders.filter((_, i) => i % 2 === 0).map(n => n.toLowerCase());
  const count = (n: string) => names.filter(v => v === n).length;
  const cookieNames = (request.headers.cookie ?? "").split(";").filter(Boolean).map(v => v.trim().split("=")[0]);
  if (context.role !== fixedRole || count("cookie") > 1 || new Set(cookieNames).size !== cookieNames.length ||
      count("origin") > 1 || (request.headers.origin !== undefined && request.headers.origin !== context.origin) ||
      (mutation && (count("origin") !== 1 || request.headers.origin !== context.origin)) ||
      (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "same-origin" && !(navigation && request.headers["sec-fetch-site"] === "none" && request.headers["sec-fetch-mode"] === "navigate"))) return 403;
  if (request.headers["content-encoding"] !== undefined || request.headers.expect !== undefined || request.headers.upgrade !== undefined) return 400;
  const length = request.headers["content-length"], encoding = request.headers["transfer-encoding"];
  if (!mutation) return encoding !== undefined || (length !== undefined && length !== "0") ? 400 : undefined;
  if (count("content-type") !== 1 || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(request.headers["content-type"] ?? "")) return 415;
  if ((length !== undefined && (!/^[1-9][0-9]{0,5}$/.test(length) || Number(length) > bodyLimit)) ||
      (encoding !== undefined && encoding !== "chunked") || (encoding !== undefined && length !== undefined)) return 400;
}
// This API accepts flat string/boolean/null command envelopes only. Explicitly
// reject duplicate/escaped keys, nested values and numeric financial values.
function flatJson(raw: string): unknown {
  const value: unknown = JSON.parse(raw);
  const member = /\s*"([A-Za-z][A-Za-z0-9]*)"\s*:\s*("(?:[^"\\]|\\[\s\S])*"|true|false|null)\s*/y;
  const start = /^\s*\{/.exec(raw); if (!start) throw failed();
  let position = start[0].length; const keys = new Set<string>();
  if (/^\s*\}\s*$/.test(raw.slice(position))) return value;
  for (;;) {
    member.lastIndex = position; const match = member.exec(raw);
    if (!match || keys.has(match[1]) || keys.size >= 24) throw failed();
    keys.add(match[1]); position = member.lastIndex;
    if (raw[position] === ",") { position++; continue; }
    if (!/^\}\s*$/.test(raw.slice(position))) throw failed();
    return value;
  }
}
function body(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0, done = false;
    const finish = (bad: boolean) => {
      if (done) return; done = true; clearTimeout(timer);
      request.removeListener("data", data); request.removeListener("end", end);
      request.removeListener("aborted", abort); request.removeListener("error", abort);
      let combined: Buffer | undefined;
      try {
        if (bad) { request.pause(); throw failed(); }
        combined = Buffer.concat(chunks, size);
        resolve(flatJson(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(combined)));
      } catch { reject(failed()); }
      finally { combined?.fill(0); chunks.forEach(c => c.fill(0)); }
    };
    const data = (chunk: Buffer) => { size += chunk.length; if (size > 8192) finish(true); else chunks.push(Buffer.from(chunk)); };
    const end = () => finish(false), abort = () => finish(true);
    const timer = setTimeout(abort, 5000); timer.unref();
    request.on("data", data); request.once("end", end); request.once("aborted", abort); request.once("error", abort);
    if (request.aborted) finish(true);
  });
}
function query(search: URLSearchParams) {
  const result: Record<string, string | number> = {};
  for (const [key, value] of search) {
    if (!["query", "status", "stock", "cursor", "limit"].includes(key) || Object.hasOwn(result, key) || value.length > 480) throw failed();
    if (key === "limit") { if (!/^[1-9][0-9]{0,2}$/.test(value)) throw failed(); result[key] = Number(value); }
    else result[key] = value;
  }
  return result;
}
export function inventorySessionRequest(request: IncomingMessage, context: LocalRequestContext) {
  return new Request(context.origin + "/protected-inventory", { headers: {
    origin: context.origin, host: new URL(context.origin).host, cookie: request.headers.cookie ?? "",
  } });
}
// INTERNAL construction by the existing TEST-confined runtime only. Every call
// re-enters the sole gateway transaction. Full schema validation runs at least
// once per process/file; later same-process admission is identity-bound only.
export function createInventoryDispatcher(gateway: AuthorizationGateway, schema:35|36|37|38|39|40|41=35) {
  return async (request: IncomingMessage, response: ServerResponse, context: LocalRequestContext) => {
    const error = (status: number, code = "UNAVAILABLE", allow?: string) => send(response, status, { error: "Inventory operation unavailable.", code }, allow);
    if (!request.url || request.url.length > 1024 || request.url.includes("#") || !isInventoryApiPath(request.url)) { error(404); return; }
    const url = new URL(request.url, context.origin), match = route.exec(url.pathname);
    const contextRead = url.pathname === "/api/admin/inventory/recovery-context";
    const recovery = recoveryRoute.exec(url.pathname);
    const productId = match?.[1], action=match?.[2]?.slice(1), receive=action==="receive", history=action==="events"||action==="movements", actions={edit:"updateProduct","selling-price":"setSellingPrice",status:"setSellingStatus",archive:"archiveProduct",reprice:"changeBuyingCost",adjust:"correctStock"} as const, extra=action&&Object.hasOwn(actions,action)?actions[action as keyof typeof actions]:undefined, operationKey = recovery?.[1] ?? operationRoute.exec(url.pathname)?.[1];
    if(action&&action!=="receive"&&schema<40){error(404);return;}
    const allowed = recovery ? "GET, POST" : receive||extra ? "POST" : productId || operationKey || contextRead || url.pathname === "/api/admin/inventory" ? "GET" : "GET, POST";
    if (!allowed.split(", ").includes(request.method ?? "")) { error(405, "INVALID_INPUT", allowed); return; }
    const mutation = request.method === "POST";
    const headerError = inventoryRequestHeaders(request, context, mutation);
    if (headerError) { error(headerError, "INVALID_INPUT"); return; }
    const live = () => { if (!context.isLive() || request.aborted || response.destroyed) throw failed(); };
    const session = inventorySessionRequest(request, context);
    // A signed session must be valid even for malformed authenticated commands.
    try { live(); await gateway.authorizeAdmin(session); } catch { error(403); return; }
    let recoveryContext: string | undefined, operationKind: string | undefined;
    const expected = request.headers["x-inventory-context"], expectedKind = request.headers["x-inventory-operation"];
    if (((mutation || recovery) && (typeof expected !== "string" || !/^[0-9a-f]{64}$/.test(expected))) ||
        request.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === "x-inventory-context").length > 1 ||
        request.rawHeaders.filter((v, i) => i % 2 === 0 && v.toLowerCase() === "x-inventory-operation").length > 1 ||
        (recovery && !mutation && (typeof expectedKind !== "string" || !["CREATE","EDIT","SELLING_PRICE","STATUS","ARCHIVE","REPRICE","RECEIVE","ADJUST"].includes(expectedKind)))) { error(400, "INVALID_INPUT"); return; }
    const guarded: AuthorizationGateway = { ...gateway, withAdminTransaction: (req, work) =>
      gateway.withAdminTransaction(req, async (tx, actor) => {
        live(); if (!(await validateReviewedSchema(tx, schema)).ok) throw failed();
        recoveryContext = await inventoryRecoveryContext(tx, actor);
        if (expected !== undefined && expected !== recoveryContext) throw failed();
        const result = await work(tx, actor); live();
        if (operationKey) {
          const op = await tx.get("SELECT kind FROM inventory_operations WHERE request_key=?", [operationKey]);
          const cancelled = await tx.get("SELECT kind FROM inventory_cancellations WHERE request_key=?", [operationKey]);
          if (op && cancelled) throw failed();
          const record = op ?? cancelled;
          if (record) operationKind = inventoryKind(record.kind);
          if (recovery && expectedKind !== undefined && expectedKind !== operationKind) throw failed();
        }
        return result;
      }) };
    const service = createInventoryService(guarded,schema);
    let input: unknown;
    try {
      if (mutation) { if (url.search) throw failed(); input = await body(request); if ((receive||extra) && (!input || typeof input !== "object" || (input as Record<string, unknown>).productId !== productId)) throw failed(); }
      else { if ((operationKey||contextRead||productId&&!history) && url.search) throw failed(); if(history){const out:Record<string,string>={productId:productId!};for(const [key,value]of url.searchParams){if(key!=="cursor"||Object.hasOwn(out,key)||value.length>80)throw failed();out[key]=value;}input=out;}else input=query(url.searchParams); }
    } catch { error(400, "INVALID_INPUT"); return; }
    try {
      live();
      const result = recovery ? mutation ? await service.resolveOrCancel(session, { ...object(input,["kind","action"]), requestKey:operationKey, context:expected }) : await service.getRecovery(session,{requestKey:operationKey,kind:expectedKind,context:expected}) : contextRead ? await guarded.withAdminTransaction(session, async () => ({ context: recoveryContext })) : operationKey ? await service.getOperationResult(session, { requestKey: operationKey }) : extra ? await service[extra](session,input) : history ? action==="events"?await service.listProductEvents(session,input):await service.listMovements(session,input) : receive ? await service.receiveStock(session, input) : mutation ? await service.createProduct(session, input) :
        productId ? await service.getProduct(session, { productId }) : await service.listProducts(session, input);
      live();
      if (!recoveryContext) throw failed();
      response.setHeader("X-Inventory-Context", recoveryContext);
      if (!operationKind && mutation && !recovery) {
        const kinds: Record<string, string> = { receive: "RECEIVE", edit: "EDIT", "selling-price": "SELLING_PRICE", status: "STATUS", archive: "ARCHIVE", reprice: "REPRICE", adjust: "ADJUST" };
        operationKind = url.pathname === "/api/admin/products" ? "CREATE" : action && kinds[action] ? kinds[action] : undefined;
      }
      if (operationKind) response.setHeader("X-Inventory-Operation", operationKind);
      send(response, 200, result); // Service has confirmed COMMIT.
    } catch (failure) {
      const code = failure instanceof InventoryError ? failure.code : "UNAVAILABLE";
      error(code === "CONFLICT" || code === "POLICY_PENDING" ? 409 : code === "NOT_FOUND" ? 404 :
        code === "INVALID_INPUT" || code === "OVERFLOW" ? 400 : 503, code);
    }
  };
}
