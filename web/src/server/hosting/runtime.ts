import {renderReadOnlyResponse} from "./read-only-response";
import { createProtectedRestoredHistory } from "../backup/protected-history";
import { assertProtectedWriterAdmission } from "../bootstrap/writer-admission";
import { assertPatchedLocalRuntime } from "./runtime-policy";
import {rebindProtectedBackupAdmission,startTestBackupWorker,type TestBackupConfiguration,type TestBackupWorker} from "../backup/worker";
import {createBackupDispatcher,isBackupApiPath} from "./backup-http";
import {createSettingsDispatcher,isSettingsApiPath} from "./settings-http";
import {createCashDispatcher,isCashApiPath} from "./cash-http";
import {createInvoicesDispatcher,isInvoicesApiPath} from "./invoices-http";
import "server-only";
import {createReportsDispatcher,isReportsApiPath} from "./reports-http";
import {createExpensesDispatcher,isExpensesApiPath} from "./expenses-http";
import {createReturnsDispatcher,isReturnsApiPath} from "./returns-http";
import {createSalesDispatcher,isSalesApiPath} from "./sales-http";
import {text} from "../inventory/validation";

import { lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import next from "next";
import type { AuthorizationConfiguration, AuthorizationGateway } from "../auth/types";
import { createProtectedRootWriterAdmission, createSelectedWriterAdmission, createImportedRootWriterAdmission } from "../bootstrap/writer-admission";
import { withProtectedLocalKeys, type LocalKeyConfiguration } from "../bootstrap/keys";
import { withAdminMaintenanceSource, type AdminMaintenanceOperation, type AdminMaintenanceSource } from "../auth/gateway";
import { assertNoAuthorizationOwner, type BootstrapLease } from "../bootstrap/ownership";
import { openAuthorizationGateway,verifySharedPassword } from "../auth/gateway";
import { confinedTestAuthentication, createAuthenticationDispatcher } from "./auth-http";
import { createInventoryPageDispatcher } from "./inventory-pages";
import { createInventoryDispatcher } from "./inventory-http";
import { rejectRedirectedPath, resolveDatabaseLocation } from "../db/location";
import { acquireRuntimeOwnership, LocalRuntimeRejected } from "./ownership";
import { createLocalHttpsHost, validateLocalOrigins, type HostDrainStage, type LocalOrigins, type LocalTlsMaterial } from "./https";

import {openDesktopOperationKeys} from "../desktop/operation-keys";
import type {Role} from "../auth/types";
import type {MarkerSnapshot} from "../desktop/recovery-contract";
type OperationKeyAccess=(role:Role,cookie:string,command:unknown)=>Promise<MarkerSnapshot>;
const operationKeyRuntimes=new WeakMap<object,OperationKeyAccess>();
type SharedLoginAccess=(password:unknown)=>Promise<Readonly<{role:Role;cookies:string[]}>>;
const sharedLoginRuntimes=new WeakMap<object,SharedLoginAccess>();
export function withLocalRuntimeSharedLogin(runtime:LocalRuntime,password:unknown){const access=sharedLoginRuntimes.get(runtime);if(!access)return Promise.reject(new LocalRuntimeRejected());return access(password);}
// Private native adapter, never an HTTP endpoint or serializable authority.
export function withLocalRuntimeOperationKeys(runtime:LocalRuntime,role:Role,cookie:string,command:unknown){
 const access=operationKeyRuntimes.get(runtime);if(!access)return Promise.reject(new LocalRuntimeRejected());return access(role,cookie,command);
}
export interface LocalRuntimeConfiguration {
  readonly testDesktopOperationKeys?:true;
  readonly onDrainStage?: (stage: "TRANSPORT"|"BACKUPS"|"AUTHORIZATION"|"FRAMEWORK"|"OWNERSHIP"|"DRAINED"|HostDrainStage) => void;
  readonly protectedIdentity?: Readonly<{ root: LocalKeyConfiguration; selected?: LocalKeyConfiguration; importedRoot?: true }>;
  readonly applicationDirectory: string;
  readonly port: number;
  readonly authorization: AuthorizationConfiguration;
  readonly tls: LocalTlsMaterial;
  readonly testReturns?:true;
  readonly testExpenses?:true;
  readonly testInvoiceCorrections?:true;
  readonly testReports?:true;
  readonly testCash?:true;
  readonly testSettings?:true;
  readonly testBackups?:TestBackupConfiguration;
  readonly testSales?:Readonly<{shopName:string}>;
}
export interface LocalRuntime {
  readonly address: Readonly<{ address: "127.0.0.1"; port: number }>;
  readonly origins: LocalOrigins;
  // True ONLY for validated isolated TEST storage; persistent deployments stay false.
  readonly authenticationEnabled: boolean;
  close(): Promise<void>;
}
type RuntimeMaintenance = <T>(password: unknown, operation: AdminMaintenanceOperation, work: (source: AdminMaintenanceSource, lease: BootstrapLease) => Promise<T>) => Promise<T>;
const maintenanceRuntimes = new WeakMap<object, RuntimeMaintenance>();
// Trusted local adapter only. No HTTP endpoint, serialized capability or new
// account writer; the SAME lease remains held while transport and worker drain.
export function withLocalRuntimeMaintenance<T>(runtime: LocalRuntime, password: unknown, operation: AdminMaintenanceOperation, work: (source: AdminMaintenanceSource, lease: BootstrapLease) => Promise<T>): Promise<T> {
  const hook = maintenanceRuntimes.get(runtime); if (!hook) return Promise.reject(new LocalRuntimeRejected());
  return hook(password, operation, work);
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
  assertPatchedLocalRuntime();
  let ownership: Awaited<ReturnType<typeof acquireRuntimeOwnership>> | undefined;
  let gateway: AuthorizationGateway | undefined;
  let backupWorker:TestBackupWorker|undefined;
  let app: ReturnType<typeof next> | undefined;
  let host: ReturnType<typeof createLocalHttpsHost> | undefined;
  let ownedErrorListeners: NodeJS.UncaughtExceptionListener[] = [];
  let beforeListeners: Set<NodeJS.UncaughtExceptionListener> | undefined;
  let preparing: Promise<void> | undefined; // Next prepare(), started early and always awaited before listen().
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
      restoreProof: input.authorization.restoreProof,
      protectedHistory: input.authorization.protectedHistory,
    };
    // Existing authoritative path validation, no creation/adoption/migration.
    const location = resolveDatabaseLocation(config.database);
    const testAuthentication = confinedTestAuthentication(config.database);
    if(input.testSales && (!testAuthentication||Object.keys(input.testSales).join(",")!=="shopName"))return reject();
    const salesShop=input.testSales?text(input.testSales.shopName,80):undefined;
    if(input.testReturns!==undefined&&(input.testReturns!==true||!testAuthentication||!salesShop))return reject();
    if(input.testExpenses!==undefined&&(input.testExpenses!==true||!testAuthentication||!input.testReturns))return reject();
    if(input.testInvoiceCorrections!==undefined&&(input.testInvoiceCorrections!==true||!testAuthentication||!input.testExpenses))return reject();
    if(input.testReports!==undefined&&(input.testReports!==true||!testAuthentication||!input.testInvoiceCorrections))return reject();
    if(input.testCash!==undefined&&(input.testCash!==true||!testAuthentication||!input.testReports))return reject();
    if(input.testSettings!==undefined&&(input.testSettings!==true||!testAuthentication||!input.testCash))return reject();
    if(input.testBackups!==undefined&&(!testAuthentication||!input.testSettings))return reject();
    if(input.testDesktopOperationKeys!==undefined&&(input.testDesktopOperationKeys!==true||!testAuthentication||!input.testSettings||!input.protectedIdentity))return reject();
    const schema=input.testSettings?41:input.testCash?40:input.testInvoiceCorrections?39:input.testExpenses?38:input.testReturns?37:salesShop?36:35;
    const conf = applicationConfig(input.applicationDirectory);
    ownership = await acquireRuntimeOwnership(location.filename);
    const liveGuard = ownership;
    if (input.protectedIdentity) {
      const identity = input.protectedIdentity, selected = identity.selected ?? identity.root;
      if (Object.keys(identity).some(k => k !== "root" && k !== "selected" && k !== "importedRoot") || (identity.importedRoot !== undefined && identity.importedRoot !== true) || schema !== 41 ||
          resolveDatabaseLocation(selected.database).filename.toLowerCase() !== location.filename.toLowerCase()) return reject();
      await withProtectedLocalKeys(selected, async keys => {
        if (!input.tls.key.equals(keys.tls.key) || !input.tls.certificate.equals(keys.tls.certificate) || !input.tls.trustAnchor.equals(keys.tls.trustAnchor) ||
            config.signingSecrets.ADMIN !== keys.signingSecrets.ADMIN || config.signingSecrets.SALESPERSON !== keys.signingSecrets.SALESPERSON) return reject();
      });
      config.protectedAdmission = identity.selected ? await createSelectedWriterAdmission(identity.root, identity.selected, liveGuard) : identity.importedRoot ? await createImportedRootWriterAdmission(identity.root,liveGuard) : await createProtectedRootWriterAdmission(identity.root, liveGuard, 41);
      if (assertProtectedWriterAdmission(config.protectedAdmission, config.database).restored) config.protectedHistory = createProtectedRestoredHistory(config.protectedAdmission, config.database);
    }
    host = createLocalHttpsHost(port, origins, input.tls, async (request, response) => {
      liveGuard.assertHeld();
      await renderReadOnlyResponse(request,response,()=>handler(request,response));
    }, testAuthentication ? async (request, response, context) => {
      liveGuard.assertHeld();
      await authentication(request, response, context);
    } : undefined, testAuthentication ? async (request, response, context) => {
      liveGuard.assertHeld();
      if(backups&&request.url&&isBackupApiPath(request.url))await backups(request,response,context);else if(settings&&request.url&&isSettingsApiPath(request.url))await settings(request,response,context);else if(cash&&request.url&&isCashApiPath(request.url))await cash(request,response,context);else if(reports&&request.url&&isReportsApiPath(request.url))await reports(request,response,context);else if(invoices&&request.url&&isInvoicesApiPath(request.url))await invoices(request,response,context);else if(expenses&&request.url&&isExpensesApiPath(request.url))await expenses(request,response,context);else if(returns&&request.url&&isReturnsApiPath(request.url))await returns(request,response,context);else if(sales&&request.url&&isSalesApiPath(request.url))await sales(request,response,context);else await inventory(request, response, context);
    } : undefined, testAuthentication ? async (request, response, context) => {
      liveGuard.assertHeld();
      await pages(request, response, context);
    } : undefined,stage=>{try{input.onDrainStage?.(stage);}catch{/* Observation only. */}});
    // Next preparation does not depend on the gateway, operation keys or backup worker. Start it now so it
    // overlaps their startup checks; nothing is served until host.listen() after every check succeeded.
    app = next({ dir: input.applicationDirectory, dev: false, quiet: true,
      hostname: "localhost", port, httpServer: host.server, conf });
    // Next16 custom-server prepare installs a process error listener which its
    // close does not remove. This runtime owns the process; retain/remove only
    // the exact listeners installed during OUR serialized preparation.
    beforeListeners = new Set(process.listeners("uncaughtException"));
    preparing = app.prepare();
    preparing.catch(() => {}); // The rejection is surfaced where it is awaited, or by partial-startup cleanup.
    gateway = await openAuthorizationGateway(config, testAuthentication ? schema : undefined); // SAME existing single native owner.
    const operationKeys=input.testDesktopOperationKeys?await openDesktopOperationKeys(input.protectedIdentity!.root,input.protectedIdentity!.selected??input.protectedIdentity!.root,()=>liveGuard.assertHeld()):undefined;
    const backupConfiguration=input.testBackups&&config.protectedAdmission?rebindProtectedBackupAdmission(input.testBackups,config.protectedAdmission,config.protectedHistory):input.testBackups;
    if(backupConfiguration)backupWorker=await startTestBackupWorker(backupConfiguration,liveGuard,config.database);
    const backups=input.testSettings?createBackupDispatcher(gateway,config.database,backupWorker,backupConfiguration):undefined;
    const authentication = createAuthenticationDispatcher(gateway);
    const settings=input.testSettings?createSettingsDispatcher(gateway,salesShop!):undefined;
    const inventory = createInventoryDispatcher(gateway,schema);
    const sales=salesShop?createSalesDispatcher(gateway,salesShop,schema===41?41:schema===40?40:schema===39?39:schema===38?38:schema===37?37:36):undefined;
    const returns=input.testReturns?createReturnsDispatcher(gateway,schema===41?41:schema===40?40:schema===39?39:schema===38?38:37):undefined;
    const expenses=input.testExpenses?createExpensesDispatcher(gateway,schema===41?41:schema===40?40:schema===39?39:38):undefined;
    const invoices=input.testInvoiceCorrections?createInvoicesDispatcher(gateway,schema===41?41:schema===40?40:39):undefined;
    const cash=input.testCash?createCashDispatcher(gateway,salesShop,schema===41?41:40):undefined;
    const reports=input.testReports?createReportsDispatcher(gateway,schema===41?41:schema===40?40:39):undefined;
    try { await preparing; } finally {
      ownedErrorListeners = process.listeners("uncaughtException").filter(listener => !beforeListeners!.has(listener));
    }
    const handler = app.getRequestHandler();
    const pages = createInventoryPageDispatcher(gateway, async (request, response) => { await handler(request, response); },schema,!!salesShop,!!input.testReturns,!!input.testExpenses,!!input.testInvoiceCorrections,!!input.testReports,!!input.testCash);
    liveGuard.assertHeld();
    await host.listen(); // Nothing accepts HTTP until every startup check succeeded.
    const drainStage=(stage: Parameters<NonNullable<LocalRuntimeConfiguration["onDrainStage"]>>[0])=>{try{input.onDrainStage?.(stage);}catch{/* Diagnostics never change ownership or drain. */}};
    let closePromise: Promise<void> | undefined;
    const liveHost = host, liveGateway = gateway, liveOwnership = ownership;
    let maintenanceStarted = false, finishingMaintenance = false;
    const result = Object.freeze({
      address: Object.freeze({ address: "127.0.0.1" as const, port }), origins, authenticationEnabled: testAuthentication,
      close() {
        if (maintenanceStarted && !finishingMaintenance) return Promise.reject(new LocalRuntimeRejected());
        closePromise ??= (async () => {
          // close() stops transport admission immediately, drains admitted HTTP,
          // then the gateway rejects/drains its own work, clears RAM and closes SQLite.
          drainStage("TRANSPORT");await liveHost.close();
          drainStage("BACKUPS");await backupWorker?.stop();
          try{operationKeys?.close();}catch{/* Helper shutdown never blocks drain. */}
          drainStage("AUTHORIZATION");await liveGateway.close();
          drainStage("FRAMEWORK");await closeApp();
          drainStage("OWNERSHIP");assertNoAuthorizationOwner(); await liveOwnership.close(); // Release cross-process guard LAST.
          drainStage("DRAINED");
        })().catch(() => reject()); // Keep ownership on uncertain closure.
        return closePromise;
      },
    });
    if(operationKeys)sharedLoginRuntimes.set(result,async password=>{
      if(maintenanceStarted||closePromise)return reject();liveGuard.assertHeld();
      const verified=await verifySharedPassword(liveGateway,password);
      if(maintenanceStarted||closePromise)return reject();liveGuard.assertHeld();
      const response=verified.role==="ADMIN"?await liveGateway.issueAdminSession(verified.receipt):await liveGateway.issueSalespersonSession(verified.receipt);
      const cookies=response.headers.getSetCookie(),prefix=verified.role==="ADMIN"?"__Secure-pos-admin.":"__Secure-pos-salesperson.";
      if(maintenanceStarted||closePromise||response.status!==200||await response.text()!=='{"ok":true}'||!cookies.length||cookies.length>8||cookies.some(v=>v.length>4096||!v.startsWith(prefix)||/[\r\n]/.test(v)||/(?:^|;)\s*Domain=/i.test(v)||!/(?:^|;)\s*Secure(?:;|$)/i.test(v)||!/(?:^|;)\s*HttpOnly(?:;|$)/i.test(v)||!/(?:^|;)\s*SameSite=Strict(?:;|$)/i.test(v)||!/(?:^|;)\s*Path=\/(?:;|$)/i.test(v)))return reject();
      liveGuard.assertHeld();return Object.freeze({role:verified.role,cookies});
    });
    if(operationKeys)operationKeyRuntimes.set(result,async(role,cookie,command)=>{
      if(maintenanceStarted||closePromise||!["ADMIN","SALESPERSON"].includes(role)||typeof cookie!=="string"||!cookie||cookie.length>4096||/[\r\n\x00]/.test(cookie))return reject();
      const names=cookie.split(";").map(v=>v.trim().split("=")[0]);if(names.some(n=>!n)||new Set(names).size!==names.length)return reject();
      const request=new Request(origins[role]+"/",{headers:{cookie,origin:origins[role]}});
      const work=async()=>{liveGuard.assertHeld();if(maintenanceStarted||closePromise)return reject();const value=await operationKeys(role,command);liveGuard.assertHeld();return value;};
      return role==="ADMIN"?liveGateway.withAdminTransaction(request,work):liveGateway.withSalespersonTransaction(request,work);
    });
    maintenanceRuntimes.set(result, async (password, operation, work) => {
      if (maintenanceStarted || closePromise || typeof work !== "function") return reject();
      maintenanceStarted = true;
      try {
        await liveHost.close(); await backupWorker?.stop(); await closeApp(); liveOwnership.assertHeld();
        const proof = await liveGateway.verifyAdminPassword(password); password = undefined;
        return await withAdminMaintenanceSource(liveGateway, proof, liveOwnership, operation, async(source,lease)=>{await operationKeys?.assertSettled();return work(source,lease);});
      } finally { finishingMaintenance = true; await result.close(); }
    });
    return result;
  } catch {
    // Partial startup: no ready listener, no returned gateway, no secret-bearing error.
    try {
      await host?.close();
      await backupWorker?.stop();
      await gateway?.close();
      if (preparing) { await preparing.catch(() => {}); ownedErrorListeners = process.listeners("uncaughtException").filter(listener => !beforeListeners!.has(listener)); } // Let an in-flight prepare settle first.
      await closeApp();
      if(ownership)assertNoAuthorizationOwner(); await ownership?.close();
    } catch { return reject(); } // Never release an uncertain owner's fence early.
    return reject();
  }
}
