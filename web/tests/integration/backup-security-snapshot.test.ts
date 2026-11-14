import { beforeAll, test, expect } from "vitest";
import { randomBytes, randomUUID, createHash, X509Certificate } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ready, seed, cashDay, passwords } from "../helpers/admin-products-settings-ready";
import { settings } from "../helpers/admin-products-settings-fixture";
import { productId } from "../helpers/invoices-fixture";
import { openProofDatabase, fingerprint, verifySchema41 } from "../helpers/backup-security-proof";
import { createSettingsService } from "../../src/server/settings/service";
import { createReportsService } from "../../src/server/reports/service";
import { createInventoryService } from "../../src/server/inventory/service";
import { createInvoicesService } from "../../src/server/invoices/service";
import { createReturnsService } from "../../src/server/returns/service";
import { startLocalRuntime, type LocalRuntimeConfiguration } from "../../src/server/hosting/runtime";
import { login, wire, material } from "../helpers/inventory-http-fixture";
import {createTestCustody} from "../../src/server/backup/crypto";
import {createTestArchive,authorizeTestRestore,restoreTestArchive,reopenTestRestore} from "../../src/server/backup/service";

const evidence = path.resolve("test-results/backup-security-preflight-20261114");
mkdirSync(evidence, { recursive: true });
beforeAll(seed);

test("real TEST41 WAL snapshot reopens isolated HTTPS and Chromium with exact records, financial totals and role boundaries", async () => {
  const f = await ready();
  let sourceClosed = false;
  const source = path.join(f.config.database.directory, f.config.database.filename);
  const isolated = mkdtempSync(path.join(path.dirname(f.config.database.directory), "snapshot-proof-"));
  const snapshot = path.join(isolated, "restored.sqlite3");
  try {
    await f.opening("100000");
    const savedSettings = createSettingsService(f.g, "TEST SHOP");
    const current = await savedSettings.current(f.admin, "ADMIN");
    if (!("context" in current) || !current.context) throw Error("TEST settings context absent.");
    await savedSettings.save(f.admin, passwords.ADMIN, randomUUID(), current.context, {
      expectedRevision: "0", settings: settings(), reason: "TEST recovery proof explicit shop settings",
    });
    const sale = (await f.sale(productId, "5")).receipt;
    const invoices = createInvoicesService(f.g, 41), invoiceContext = (await invoices.context(f.admin)).context;
    const detail = await invoices.detail(f.admin, sale.id), key = randomUUID();
    await invoices.prepare(f.admin, passwords.ADMIN, key, invoiceContext, {
      invoiceId: sale.id, expectedRevision: detail.version,
      lines: detail.lines.map(l => ({ saleLineId: l.saleLineId, quantity: "2", unitPricePaisa: "11000", discountPercent: "0", physicalQuantity: (BigInt(l.ledgerQuantity) + BigInt(l.quantity) - BigInt(2)).toString() })),
      reason: "TEST verified original quantity error", stockEvidence: "TEST actual shelf quantities counted",
      settlementEvidence: "TEST original settled payment checked", settlementVerified: "YES",
      cashDate: cashDay(), cashEvidence: "TEST actual physical refund verified", effectiveDate: cashDay(),
    });
    await invoices.execute(f.admin, key, invoiceContext, "ACTUAL_STOCK_AND_CASH_VERIFIED", cashDay());
    const returns = createReturnsService(f.g, 41);
    const invoice = (await returns.invoices(f.staff, "SALESPERSON")).items.find(i => i.invoiceId === sale.id)!;
    const returnKey = randomUUID();
    await returns.prepareSalesperson(f.staff, returnKey, { invoiceId: sale.id, lines: [{ saleLineId: invoice.lines[0].saleLineId, quantity: "1" }] });
    await returns.approve(f.admin, passwords.ADMIN, returnKey, "APPROVE");
    const returned = await returns.executeSalesperson(f.staff, returnKey, "CASH_HANDED_OVER", cashDay());
    if (!("refund" in returned) || !returned.refund) throw Error("TEST refund absent.");
    await returns.dispose(f.admin, passwords.ADMIN, randomUUID(), {
      returnId: returned.refund.id,
      lines: [{ returnLineId: returned.refund.lines[0].returnLineId, restockQuantity: "1", writeOffQuantity: "0", reason: "TEST inspected returned goods sellable" }],
    });
    await f.expense("1000");
    const inventory = createInventoryService(f.g, 41), product = await inventory.getProduct(f.admin, { productId });
    await inventory.changeBuyingCost(f.admin, {
      requestKey: randomUUID(), productId, expectedProductVersion: product.productVersion,
      expectedBalanceVersion: product.balanceVersion, buyingPricePaisa: "15000",
      reason: "TEST revalue remaining stock preserving sold snapshots", confirmAllRemaining: true,
    });
    const closeDate="2026-11-01",closeReview=await f.cash.summary(f.admin,closeDate);
    await f.act("CLOSE_DAY",{businessDate:closeDate,countId:null,sourceDigest:closeReview.sourceDigest,allowUnreconciled:"YES",evidence:"TEST missing historical cash evidence stays unreconciled"});
    const beforeClosings=await f.cash.closings(f.admin,closeDate,closeDate);
    const reports = createReportsService(f.g, 41), period = { from: "2000-01-01", to: cashDay() };
    const reportPeriod={...period,asOf:String(Date.now())};
    const beforeReport = await reports.overview(f.admin, reportPeriod);
    const beforeCash = await f.cash.summary(f.admin, cashDay());
    const beforeReceipt = await f.sales.get(f.staff, sale.id);
    const reader = openProofDatabase(source);
    let original;
    try {
      reader.exec("BEGIN");
      await verifySchema41(reader);
      original = fingerprint(reader);
      expect(statSync(source + "-wal").size).toBeGreaterThan(0);
      await reader.backup(snapshot, { progress: () => 32 });
      expect(fingerprint(reader)).toEqual(original);
      reader.exec("ROLLBACK");
    } finally { reader.close(); }
    const restored = openProofDatabase(snapshot);
    try {
      restored.exec("BEGIN");
      await verifySchema41(restored);
      expect(fingerprint(restored)).toEqual(original);
      restored.exec("ROLLBACK");
    } finally { restored.close(); }
    // Finish the genuine source owner before opening an isolated owner. This is
    // a disposable TEST reopen, not authority transfer or production re-enrollment.
    const vault=mkdtempSync(path.join(path.dirname(f.config.database.directory),"restore-vault-"));
    const archives=mkdtempSync(path.join(path.dirname(f.config.database.directory),"restore-archives-"));
    const target=mkdtempSync(path.join(path.dirname(f.config.database.directory),"authorized-restore-"));
    const custody=await createTestCustody(vault);
    const archive=await createTestArchive(custody,f.config.database,archives);
    const permit=await authorizeTestRestore(f.g,f.admin,passwords.ADMIN,archive.archive,target);
    const recovered=await restoreTestArchive(custody,permit,archive.archive,target);
    const oldCookie = f.admin.headers.get("cookie")!;
    await f.g.close(); sourceClosed = true;
    const config: LocalRuntimeConfiguration = {
      ...f.runtime, applicationDirectory: process.env.SHOP_POS_INVENTORY_BUILT_APP ?? process.cwd(),
      authorization: { ...f.config, database: { ...f.config.database,...recovered.database },restoreProof:recovered.proof,
        signingSecrets: { ADMIN: randomBytes(48).toString("base64url"), SALESPERSON: randomBytes(48).toString("base64url") } },
    };
    const runtime = await startLocalRuntime(config);
    try {
      const stale = await wire(config, "/api/auth/session", "ADMIN", [oldCookie]);
      expect(JSON.parse(stale.body).authenticated).toBe(false);
      const adminReply = await wire(config, "/api/auth/login", "ADMIN", [], { password: passwords.ADMIN });
      if (adminReply.status !== 200) throw Error("TEST restored Admin login status " + adminReply.status);
      const admin = adminReply.cookies, staff = await login(config, "SALESPERSON");
      expect((await wire(config, "/api/admin/products", "SALESPERSON", staff)).status).toBe(403);
      const receipt = await wire(config, "/api/pos/sales/" + sale.id, "SALESPERSON", staff);
      expect(receipt.status).toBe(200);
      expect(JSON.parse(receipt.body)).toEqual(beforeReceipt);
      const edited = await wire(config, "/api/admin/products/" + productId, "ADMIN", admin);
      expect(edited.status).toBe(200);
      expect(JSON.parse(edited.body).buyingPricePaisa).toBe("15000");
      const spki = createHash("sha256").update(new X509Certificate(material.certificate).publicKey.export({ type: "spki", format: "der" })).digest("base64");
      const browser = await chromium.launch({ headless: true, args: ["--ignore-certificate-errors-spki-list=" + spki] });
      try {
        const context = await browser.newContext({ ignoreHTTPSErrors: false });
        const page = await context.newPage();
        await page.goto(config.authorization.origins.ADMIN + "/login");
        await expect.poll(()=>page.getByRole("button",{name:"Open Shop",exact:true}).isEnabled(),{timeout:60000}).toBe(true);
        expect(await page.locator('input[type="password"]').inputValue()).toBe("");
        await page.locator('input[type="password"]').fill(passwords.ADMIN);
        await page.getByRole("button", { name: "Open Shop", exact: true }).click();
        await expect.poll(()=>new URL(page.url()).pathname,{timeout:60000}).toBe("/admin/products");
        await page.goto(config.authorization.origins.ADMIN + "/admin/settings");
        await page.getByText("TEST Explicit Shop", { exact: false }).first().waitFor();
        expect(await page.getByLabel(/shop name/i).inputValue()).toBe("TEST Explicit Shop");
        await context.close();
      } finally { await browser.close(); }
    } finally { await runtime.close(); }
    // Reopen via the same private gateway and compare genuine financial readers.
    const { openAuthorizationGateway } = await import("../../src/server/auth/gateway");
    const { credentials } = await import("../helpers/admin-products-settings-fixture");
    const resumed=await reopenTestRestore(custody,target);
    const gateway = await openAuthorizationGateway({...config.authorization,restoreProof:resumed.proof}, 41);
    try {
      const admin = await credentials(gateway, config.authorization, "ADMIN");
      const afterReport=await createReportsService(gateway,41).overview(admin,reportPeriod);
      const financial=(v:unknown):unknown=>Array.isArray(v)?v.map(financial):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).filter(([k])=>k!=="snapshot"&&k!=="capturedAtMs").map(([k,x])=>[k,financial(x)])):v;
      expect(financial(afterReport)).toEqual(financial(beforeReport));
      expect(afterReport.snapshot).not.toBe(beforeReport.snapshot);
      expect(BigInt(afterReport.inventory.capturedAtMs)).toBeGreaterThanOrEqual(BigInt(beforeReport.inventory.capturedAtMs));
      const { createCashService } = await import("../../src/server/cash/service");
      const afterCash = await createCashService(gateway, "TEST SHOP", 41).summary(admin, cashDay());
      expect(afterCash.currentExpectedPaisa).toBe(beforeCash.currentExpectedPaisa);
      expect(await createCashService(gateway,"TEST SHOP",41).closings(admin,closeDate,closeDate)).toEqual(beforeClosings);
    } finally { await gateway.close(); }
    writeFileSync(path.join(evidence, "snapshot-reconciliation.json"), JSON.stringify({
      status: "PASS_ENCRYPTED_SAME_MACHINE_TEST_RESTORE", schema: 41, encryptedBackup: true,
      machine: "SAME_MACHINE_ONLY", tables: original.tables.map(t => ({ name: t.name, count: t.count })),
      exactRowsAndSchemaMatched: true, restoredHttpsAndChromium: true, productionActivation: false,
    }, null, 2));
  } finally { if (!sourceClosed) await f.g.close(); }
}, 300000);

test("interrupted native snapshot preserves prior good copy and every source row", async () => {
  const f = await ready();
  const source = path.join(f.config.database.directory, f.config.database.filename);
  const directory = mkdtempSync(path.join(path.dirname(f.config.database.directory), "interruption-proof-"));
  const good = path.join(directory, "good.sqlite3"), incomplete = path.join(directory, "incomplete.sqlite3");
  const reader = openProofDatabase(source);
  try {
    reader.exec("BEGIN"); const original = fingerprint(reader);
    await reader.backup(good); const bytes = readFileSync(good);
    await expect(reader.backup(incomplete, { progress: () => { throw Error("TEST deliberate cancellation"); } })).rejects.toThrow();
    expect(readFileSync(good)).toEqual(bytes);
    expect(fingerprint(reader)).toEqual(original);
    reader.exec("ROLLBACK");
    const copy = openProofDatabase(good);
    try { await verifySchema41(copy); expect(fingerprint(copy)).toEqual(original); } finally { copy.close(); }
  } finally { reader.close(); await f.g.close(); }
});

test("old schema, changed audit row and corruption fail isolated verification without modifying source", async () => {
  const f = await ready();
  const service = createSettingsService(f.g, "TEST SHOP"), c = await service.current(f.admin, "ADMIN");
  if (!("context" in c) || !c.context) throw Error("TEST context.");
  await service.save(f.admin, passwords.ADMIN, randomUUID(), c.context, { expectedRevision: "0", settings: settings(), reason: "TEST source audit preserved" });
  const source = path.join(f.config.database.directory, f.config.database.filename);
  const directory = mkdtempSync(path.join(path.dirname(f.config.database.directory), "negative-proof-"));
  const snapshot = path.join(directory, "tampered.sqlite3"), corrupt = path.join(directory, "corrupt.sqlite3");
  const reader = openProofDatabase(source);
  try {
    reader.exec("BEGIN"); const original = fingerprint(reader); await reader.backup(snapshot);
    const altered = openProofDatabase(snapshot, false);
    try {
      altered.exec("PRAGMA user_version=40"); await expect(verifySchema41(altered)).rejects.toThrow();
      altered.exec("PRAGMA user_version=41");
      const triggers = altered.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='shop_settings_revisions'").all();
      for (const t of triggers) altered.exec('DROP TRIGGER "' + t.name + '"');
      altered.exec("UPDATE shop_settings_revisions SET reason='TEST changed historical audit'");
      for (const t of triggers) altered.exec(String(t.sql));
      await verifySchema41(altered);
      expect(fingerprint(altered)).not.toEqual(original);
    } finally { altered.close(); }
    copyFileSync(snapshot, corrupt);
    const bytes = readFileSync(corrupt); bytes.fill(0, 0, 128); writeFileSync(corrupt, bytes);
    const broken = openProofDatabase(corrupt);
    try { await expect(verifySchema41(broken)).rejects.toThrow(); } finally { broken.close(); }
    expect(fingerprint(reader)).toEqual(original); reader.exec("ROLLBACK");
  } finally { reader.close(); await f.g.close(); }
});

test("proof helper rejects persistent paths before opening any database", () => {
  expect(() => openProofDatabase(path.resolve("src/server/test.sqlite3"))).toThrow("TEST proof path rejected.");
});

test("native WAL online snapshot stays at one read point while a real expense commits concurrently",async()=>{
 const f=await ready(),source=path.join(f.config.database.directory,f.config.database.filename),directory=mkdtempSync(path.join(path.dirname(f.config.database.directory),"concurrent-backup-")),snapshot=path.join(directory,"snapshot.sqlite3");
 await f.opening("100000");
 const reader=openProofDatabase(source);let writing:Promise<unknown>|undefined,done=false,callbacks=0;
 try{
  reader.exec("BEGIN");const original=fingerprint(reader);
  await reader.backup(snapshot,{progress:()=>{callbacks++;if(!writing)writing=f.expense("1000").then(v=>{done=true;return v;});return done?16:0;}});
  await writing;expect(done).toBe(true);expect(callbacks).toBeGreaterThan(1);expect(fingerprint(reader)).toEqual(original);
  const copy=openProofDatabase(snapshot);try{await verifySchema41(copy);expect(fingerprint(copy)).toEqual(original);}finally{copy.close();}
  reader.exec("ROLLBACK");const next=fingerprint(reader);
  expect(BigInt(next.tables.find(t=>t.name==="expenses")!.count)).toBe(BigInt(original.tables.find(t=>t.name==="expenses")!.count)+BigInt(1));
 }finally{await writing?.catch(()=>{});reader.close();await f.g.close();}
},180000);
