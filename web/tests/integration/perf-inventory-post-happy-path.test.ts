import { afterEach, beforeAll, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { gateway, seed } from "../helpers/admin-products-settings-fixture";
import { createInventoryDispatcher } from "../../src/server/hosting/inventory-http";
import { createInventoryService } from "../../src/server/inventory/service";
import type { MutationResult } from "../../src/server/inventory/contracts";
import { clearReviewedSchemaAdmission } from "../../src/server/db/validate-schema";

beforeAll(seed);
const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
  clearReviewedSchemaAdmission();
});

function mockRequest(method: string, url: string, headers: Record<string, string>, body = ""): IncomingMessage {
  const headerMap = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const rawHeaders = Object.entries(headers).flatMap(([k, v]) => [k, v]);
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const req = {
    method, url, aborted: false, headers: headerMap, rawHeaders,
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      if (event === "data" && body) queueMicrotask(() => fn(Buffer.from(body)));
      if (event === "end") queueMicrotask(() => fn());
      return req;
    },
    once(event: string, fn: (...args: unknown[]) => void) {
      const wrap = (...args: unknown[]) => { req.removeListener(event, wrap); fn(...args); };
      return req.on(event, wrap);
    },
    removeListener(event: string, fn: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(fn); return req;
    },
    pause() { return req; },
  };
  return req as unknown as IncomingMessage;
}

function mockResponse() {
  const headers: Record<string, string> = {};
  let status = 0;
  let headersSent = false;
  const chunks: Buffer[] = [];
  const res = {
    destroyed: false,
    get headersSent() { return headersSent; },
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = String(value); },
    getHeader(name: string) { return headers[name.toLowerCase()]; },
    writeHead(code: number, extra?: Record<string, string>) {
      status = code; headersSent = true;
      if (extra) for (const [k, v] of Object.entries(extra)) headers[k.toLowerCase()] = String(v);
    },
    end(chunk?: string | Buffer) { if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); },
  } as unknown as ServerResponse & { status: () => number; body: () => string; headerMap: Record<string, string> };
  return Object.assign(res, {
    status: () => status,
    body: () => Buffer.concat(chunks).toString("utf8"),
    headerMap: headers,
  });
}

test("POST create returns committed MutationResult + CREATE operation header without recovery GET", async () => {
  const f = await gateway();
  closers.push(async () => { await f.g.close(); });
  const service = createInventoryService(f.g, 41);
  const command = {
    requestKey: randomUUID(),
    name: "TEST perf product " + randomUUID(),
    unit: "PACK",
    buyingPricePaisa: "10000",
    sellingPricePaisa: "20000",
    sellingActive: true,
    openingQuantity: "5",
    lowStockThreshold: "2",
  };
  const t0 = performance.now();
  const created = await service.createProduct(f.admin, command) as MutationResult;
  const createMs = performance.now() - t0;
  expect(created.operationId).toBeTruthy();
  expect(created.product.name).toBe(command.name);
  expect(await service.createProduct(f.admin, command)).toEqual(created);

  const dispatch = createInventoryDispatcher(f.g, 41);
  const cookie = f.admin.headers.get("cookie") ?? "";
  const origin = f.config.origins.ADMIN;
  const host = new URL(origin).host;
  const contextRes = mockResponse();
  await dispatch(
    mockRequest("GET", "/api/admin/inventory/recovery-context", {
      origin, cookie, host, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
    }),
    contextRes,
    { origin, role: "ADMIN", isLive: () => true } as never,
  );
  expect(contextRes.status()).toBe(200);
  const binding = (JSON.parse(contextRes.body()) as { context: string }).context;

  const second = {
    requestKey: randomUUID(),
    name: "TEST perf product " + randomUUID(),
    unit: "PACK",
    buyingPricePaisa: "10000",
    sellingPricePaisa: "20000",
    sellingActive: true,
    openingQuantity: "3",
    lowStockThreshold: "1",
  };
  const bodyText = JSON.stringify(second);
  const posted = mockResponse();
  await dispatch(
    mockRequest("POST", "/api/admin/products", {
      origin, cookie, host, "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bodyText)),
      "x-inventory-context": binding, "sec-fetch-site": "same-origin", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty",
    }, bodyText),
    posted,
    { origin, role: "ADMIN", isLive: () => true } as never,
  );
  if (posted.status() !== 200) throw new Error("POST failed: " + posted.status() + " " + posted.body());
  expect(posted.headerMap["x-inventory-context"]).toBe(binding);
  expect(posted.headerMap["x-inventory-operation"]).toBe("CREATE");
  expect((JSON.parse(posted.body()) as MutationResult).product.name).toBe(second.name);

  const client = readFileSync(path.resolve("src/lib/inventory/client.ts"), "utf8");
  expect(client).toContain("Happy path uses the committed POST body");
  expect(client).toContain('response.headers.get("X-Inventory-Operation")');

  const dir = path.resolve("test-results/perf-proof-baseline-20261118");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "inventory-post-happy-path.json"), JSON.stringify({
    measuredAt: new Date().toISOString(),
    serviceCreateMs: Math.round(createMs),
    operationHeader: posted.headerMap["x-inventory-operation"],
    productId: created.product.id,
    note: "Happy-path POST body is authoritative; recovery GET not required on success.",
  }, null, 2));
}, 180000);
