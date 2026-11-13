import {withTestInvoicesRender} from "./invoices-render";
import "server-only";
import {withTestReportsRender} from "./reports-render";
import {withTestExpensesRender} from "./expenses-render";
import {withTestReturnsRender} from "./returns-render";
import {withTestSalesRender} from "./sales-render";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthorizationGateway } from "../auth/types";
import { validateReviewedSchema } from "../db/validate-schema";
import { inventoryRequestHeaders, inventorySessionRequest } from "./inventory-http";
import { withTestLoginRender } from "./login-render";
import { withTestInventoryRender } from "./inventory-render";
import type { LocalRequestContext } from "./https";
const expensePages=["/admin/dashboard","/admin/expenses","/admin/reports/profit","/admin/profit/today","/admin/daily-closing"];
const invoicePages=["/admin/reports","/admin/sales","/admin/reports/sales","/admin/sales/today"];
const reportPages=["/admin/investment","/admin/reports/products","/admin/reports/expenses"];
const pages = [...reportPages,...invoicePages,...expensePages,"/admin/returns", "/admin/products", "/admin/products/new", "/admin/inventory/available-stock", "/admin/inventory/low-stock"];
export function isInventoryPagePath(raw: string) {
 if (raw.length > 1024 || raw.split("?").length > 2 || raw.includes("#") || raw.includes("\\")) return false;
 const [pathname, search] = raw.split("?");
 if (pathname === "/login" || pathname==="/pos" || pathname==="/pos/history" || pathname==="/pos/returns" || pathname==="/pos/expenses" || pages.includes(pathname)) return search === undefined || /^_rsc=[A-Za-z0-9_-]{1,80}$/.test(search);
 // Built code/styles only; never arbitrary Next routes, data/image proxy, source
 // maps, public files, traversal, encoded slashes or user-selected filesystem paths.
 if (search !== undefined || !pathname.startsWith("/_next/static/")) return false;
 let decoded: string; try { decoded = decodeURIComponent(pathname); } catch { return false; }
 return /^\/_next\/static\/[A-Za-z0-9_()[\].~/-]+\.(?:js|css|woff2?)$/.test(decoded) &&
  !decoded.slice(1).split("/").some(p => p === "." || p === ".." || p === "");
}
export function createInventoryPageDispatcher(gateway: AuthorizationGateway, render: (req: IncomingMessage, res: ServerResponse) => Promise<void>,schema:35|36|37|38|39=35, salesEnabled=false, returnsEnabled=false,expensesEnabled=false,invoicesEnabled=false,reportsEnabled=false) {
 return async (request: IncomingMessage, response: ServerResponse, context: LocalRequestContext) => {
  const reject = (status: number) => { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store, private" }); response.end('{"error":"Inventory unavailable."}'); };
  if (!request.url || !isInventoryPagePath(request.url)) { reject(404); return; }
  if (request.method !== "GET") { response.setHeader("Allow", "GET"); reject(405); return; }
  const login = request.url?.split("?")[0] === "/login", asset = request.url?.startsWith("/_next/static/");
  const pos=request.url?.split("?")[0]==="/pos"||request.url?.split("?")[0]==="/pos/history"||request.url?.split("?")[0]==="/pos/returns"||request.url?.split("?")[0]==="/pos/expenses";
  if((expensePages.includes(request.url.split("?")[0])||request.url.split("?")[0]==="/pos/expenses")&&!expensesEnabled){reject(404);return;}
  if(reportPages.includes(request.url.split("?")[0])&&!reportsEnabled){reject(404);return;}
  if(invoicePages.includes(request.url.split("?")[0])&&!invoicesEnabled){reject(404);return;}
  const returnsPage=["/pos/returns","/admin/returns"].includes(request.url.split("?")[0]);if(returnsPage&&!returnsEnabled){reject(404);return;}
  if(pos&&!salesEnabled){reject(404);return;}
  if (inventoryRequestHeaders(request, context, false, true, login || asset ? context.role : pos?"SALESPERSON":"ADMIN")) { reject(403); return; }
  if (!login && !asset) try {
   await (pos?gateway.withSalespersonTransaction.bind(gateway):gateway.withAdminTransaction.bind(gateway))(inventorySessionRequest(request, context), async tx => {
    if (!(await validateReviewedSchema(tx, schema)).ok || !context.isLive() || request.aborted || response.destroyed) throw Error("Unavailable.");
   });
  } catch { reject(403); return; }
  if (!context.isLive() || request.aborted || response.destroyed) { reject(503); return; }
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Content-Security-Policy", "frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  // Bounded compiled assets and Login are public ONLY inside this validated TEST
  // host. Data pages still require fresh SQL authority before every render.
  // Next can retain a render promise after its transport has closed (including
  // aborted RSC/prefetch). Only this read-only renderer is detachable: the SQL
  // authorization above has already settled and no gateway/transaction is passed
  // into Next. Auth and inventory mutation dispatchers still drain their work.
  const renderPage = async () => {
   let done!: () => void;
   const closed = new Promise<void>(resolve => { done = resolve; });
   response.once("close", done);
   try {
    if (request.aborted || response.destroyed) return;
    // Promise.race observes late render rejection too; no unhandled rejection.
    await Promise.race([render(request,response), closed]);
   } finally { response.removeListener("close", done); }
  };
  const expenseRender=()=>withTestReportsRender(reportsEnabled,()=>withTestInvoicesRender(invoicesEnabled,()=>withTestExpensesRender(expensesEnabled,renderPage)));
  if (login) await withTestLoginRender(context.role,()=>withTestSalesRender(salesEnabled,()=>withTestReturnsRender(returnsEnabled,expenseRender)));
  else if (asset) await renderPage();
  else await withTestSalesRender(salesEnabled,()=>withTestReturnsRender(returnsEnabled,()=>pos?expenseRender():withTestInventoryRender(expenseRender)));
 };
}
