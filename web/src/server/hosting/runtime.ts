import {createInvoicesDispatcher,isInvoicesApiPath} from "./invoices-http";
import "server-only";
import {createExpensesDispatcher,isExpensesApiPath} from "./expenses-http";
import {createReturnsDispatcher,isReturnsApiPath} from "./returns-http";
import {createSalesDispatcher,isSalesApiPath} from "./sales-http";
import {text} from "../inventory/validation";

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import next from "next";
import type { AuthorizationConfiguration, AuthorizationGateway } from "../auth/types";
import { openAuthorizationGateway } from "../auth/gateway";
import { confinedTestAuthentication, createAuthenticationDispatcher } from "./auth-http";
import { createInventoryPageDispatcher } from "./inventory-pages";
import { createInventoryDispatcher } from "./inventory-http";
import { rejectRedirectedPath, resolveDatabaseLocation } from "../db/location";
import { acquireRuntimeOwnership, LocalRuntimeRejected } from "./ownership";
import { createLocalHttpsHost, validateLocalOrigins, type LocalOrigins, type LocalTlsMaterial } from "./https";

export interface LocalRuntimeConfiguration {
  readonly applicationDirectory: string;
  readonly port: number;
  readonly authorization: AuthorizationConfiguration;
  readonly tls: LocalTlsMaterial;
  readonly testReturns?:true;
  readonly testExpenses?:true;
  readonly testInvoiceCorrections?:true;
  readonly testSales?:Readonly<{shopName:string}>;
}
export interface LocalRuntime {
  readonly address: Readonly<{ address: "127.0.0.1"; port: number }>;
  readonly origins: LocalOrigins;
  // True ONLY for validated isolated TEST storage; persistent deployments stay false.
  readonly authenticationEnabled: boolean;
  close(): Promise<void>;
}
const reject = (): never => { throw new LocalRuntimeRejected(); };

// Supported Next custom server, with its normal production build/assets, NOT
// standalone/server.js and NOT next dev. No internal HTTP server is started.
function applicationConfig(directory: string) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) return reject();
  rejectRedirectedPath(directory);
  if (realpathSync.native(directory).toLowerCase() !== path.resolve(directory).toLowerCase()) return reject();
  const filename = path.join(directory, ".next", "required-server-files.json");
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) return reject();
  const manifest = JSON.parse(readFileSync(filename, "utf8"));
  if (!manifest.config || manifest.config.output || manifest.config.distDir !== ".next" ||
      !readFileSync(path.join(directory, ".next", "BUILD_ID"), "utf8").trim()) return reject();
  return manifest.config;
}

// Explicit trusted bootstrap only. Import has no side effects; no configuration,
// signing key, certificate, credential, migration or account is generated here.
// Persistent production storage exposes only health; TEST auth is path-confined.
export async function startLocalRuntime(input: LocalRuntimeConfiguration): Promise<LocalRuntime> {
  let ownership: Awaited<ReturnType<typeof acquireRuntimeOwnership>> | undefined;
  let gateway: AuthorizationGateway | undefined;
  let app: ReturnType<typeof next> | undefined;
  let host: ReturnType<typeof createLocalHttpsHost> | undefined;
  let ownedErrorListeners: NodeJS.UncaughtExceptionListener[] = [];
  const closeApp = async () => {
    await app?.close();
    for (const listener of ownedErrorListeners) process.removeListener("uncaughtException", listener);
    ownedErrorListeners = [];
  };
  try {
    if (!input?.authorization || !input.tls || input.authorization.database.create === true) return reject();
    const port = input.port;
    const origins = await validateLocalOrigins(port, input.authorization.origins);
    const config: AuthorizationConfiguration = {
      database: Object.freeze({ ...input.authorization.database, create: false }),
      migrationsDirectory: input.authorization.migrationsDirectory,
      origins,
      signingSecrets: Object.freeze({ ...input.authorization.signingSecrets }),
      sessionLifetimeSeconds: input.authorization.sessionLifetimeSeconds,
    };
    // Existing authoritative path validation, no creation/adoption/migration.
    const location = resolveDatabaseLocation(config.database);
    const testAuthentication = confinedTestAuthentication(config.database);
    if(input.testSales && (!testAuthentication||Object.keys(input.testSales).join(",")!=="shopName"))return reject();
    const salesShop=input.testSales?text(input.testSales.shopName,80):undefined;
    if(input.testReturns!==undefined&&(input.testReturns!==true||!testAuthentication||!salesShop))return reject();
    if(input.testExpenses!==undefined&&(input.testExpenses!==true||!testAuthentication||!input.testReturns))return reject();
    if(input.testInvoiceCorrections!==undefined&&(input.testInvoiceCorrections!==true||!testAuthentication||!input.testExpenses))return reject();
    const schema=input.testInvoiceCorrections?39:input.testExpenses?38:input.testReturns?37:salesShop?36:35;
    const conf = applicationConfig(input.applicationDirectory);
    ownership = await acquireRuntimeOwnership(location.filename);
    const liveGuard = ownership;
    host = createLocalHttpsHost(port, origins, input.tls, async (request, response) => {
      liveGuard.assertHeld();
      await handler(request, response);
    }, testAuthentication ? async (request, response, context) => {
      liveGuard.assertHeld();
      await authentication(request, response, context);
    } : undefined, testAuthentication ? async (request, response, context) => {
      liveGuard.assertHeld();
      if(invoices&&request.url&&isInvoicesApiPath(request.url))await invoices(request,response,context);else if(expenses&&request.url&&isExpensesApiPath(request.url))await expenses(request,response,context);else if(returns&&request.url&&isReturnsApiPath(request.url))await returns(request,response,context);else if(sales&&request.url&&isSalesApiPath(request.url))await sales(request,response,context);else await inventory(request, response, context);
    } : undefined, testAuthentication ? async (request, response, context) => {
      liveGuard.assertHeld();
      await pages(request, response, context);
    } : undefined);
    gateway = await openAuthorizationGateway(config, testAuthentication ? schema : undefined); // SAME existing single native owner.
    const authentication = createAuthenticationDispatcher(gateway);
    const inventory = createInventoryDispatcher(gateway,schema);
    const sales=salesShop?createSalesDispatcher(gateway,salesShop,schema===39?39:schema===38?38:schema===37?37:36):undefined;
    const returns=input.testReturns?createReturnsDispatcher(gateway,schema===39?39:schema===38?38:37):undefined;
    const expenses=input.testExpenses?createExpensesDispatcher(gateway,schema===39?39:38):undefined;
    const invoices=input.testInvoiceCorrections?createInvoicesDispatcher(gateway):undefined;
    app = next({ dir: input.applicationDirectory, dev: false, quiet: true,
      hostname: "localhost", port, httpServer: host.server, conf });
    // Next16 custom-server prepare installs a process error listener which its
    // close does not remove. This runtime owns the process; retain/remove only
    // the exact listeners installed during OUR serialized preparation.
    const beforeListeners = new Set(process.listeners("uncaughtException"));
    try { await app.prepare(); } finally {
      ownedErrorListeners = process.listeners("uncaughtException").filter(listener => !beforeListeners.has(listener));
    }
    const handler = app.getRequestHandler();
    const pages = createInventoryPageDispatcher(gateway, async (request, response) => { await handler(request, response); },schema,!!salesShop,!!input.testReturns,!!input.testExpenses,!!input.testInvoiceCorrections);
    liveGuard.assertHeld();
    await host.listen(); // Nothing accepts HTTP until every startup check succeeded.
    let closePromise: Promise<void> | undefined;
    const liveHost = host, liveGateway = gateway, liveOwnership = ownership;
    return Object.freeze({
      address: Object.freeze({ address: "127.0.0.1" as const, port }), origins, authenticationEnabled: testAuthentication,
      close() {
        closePromise ??= (async () => {
          // close() stops transport admission immediately, drains admitted HTTP,
          // then the gateway rejects/drains its own work, clears RAM and closes SQLite.
          await liveHost.close();
          await liveGateway.close();
          await closeApp();
          await liveOwnership.close(); // Release cross-process guard LAST.
        })().catch(() => reject()); // Keep ownership on uncertain closure.
        return closePromise;
      },
    });
  } catch {
    // Partial startup: no ready listener, no returned gateway, no secret-bearing error.
    try {
      await host?.close();
      await gateway?.close();
      await closeApp();
      await ownership?.close();
    } catch { return reject(); } // Never release an uncertain owner's fence early.
    return reject();
  }
}
