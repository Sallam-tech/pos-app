import {isCashApiPath} from "./cash-http";
import {isInvoicesApiPath} from "./invoices-http";
import "server-only";
import {isReportsApiPath} from "./reports-http";
import {isExpensesApiPath} from "./expenses-http";
import {isReturnsApiPath} from "./returns-http";
import {isSalesApiPath} from "./sales-http";

import { X509Certificate, createPrivateKey } from "node:crypto";
import { promises as dns } from "node:dns";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { createSecureContext, type TLSSocket } from "node:tls";
import type { Role } from "../auth/types";
import { isInventoryPagePath } from "./inventory-pages";
import { isInventoryApiPath } from "./inventory-http";
import { LocalRuntimeRejected } from "./ownership";

export interface LocalTlsMaterial {
  readonly key: Buffer;
  readonly certificate: Buffer;
  readonly trustAnchor: Buffer;
}
export type LocalOrigins = Readonly<Record<Role, string>>;
export interface LocalRequestContext { readonly role: Role; readonly origin: string; readonly isLive: () => boolean }
type Handler = (request: IncomingMessage, response: ServerResponse, context: LocalRequestContext) => Promise<void>;
const reject = (): never => { throw new LocalRuntimeRejected(); };

// No DNS suffix assumptions or hosts-file edits. This fixed pair is deliberately
// different cookie hosts, not two ports on the same hostname.
export async function validateLocalOrigins(port: number, origins: LocalOrigins): Promise<LocalOrigins> {
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535 ||
      origins?.ADMIN !== "https://localhost:" + port ||
      origins?.SALESPERSON !== "https://127.0.0.1:" + port) return reject();
  try {
    const addresses = await dns.lookup("localhost", { all: true, family: 4 });
    if (!addresses.length || addresses.some(a => a.family !== 4 || a.address !== "127.0.0.1")) return reject();
  } catch { return reject(); }
  return Object.freeze({ ADMIN: origins.ADMIN, SALESPERSON: origins.SALESPERSON });
}

function material(input: LocalTlsMaterial) {
  const valid = (value: unknown, max: number): value is Buffer =>
    Buffer.isBuffer(value) && value.length > 0 && value.length <= max;
  if (!input || !valid(input.key, 16384) || !valid(input.certificate, 16384) || !valid(input.trustAnchor, 16384)) return reject();
  const key = Buffer.from(input.key), cert = Buffer.from(input.certificate), ca = Buffer.from(input.trustAnchor);
  try {
    if ((cert.toString("ascii").match(/BEGIN CERTIFICATE/g) ?? []).length !== 1 ||
        (ca.toString("ascii").match(/BEGIN CERTIFICATE/g) ?? []).length !== 1) return reject();
    const leaf = new X509Certificate(cert), root = new X509Certificate(ca);
    const from = Math.max(Date.parse(leaf.validFrom), Date.parse(root.validFrom));
    const until = Math.min(Date.parse(leaf.validTo), Date.parse(root.validTo));
    if (!Number.isFinite(from) || !Number.isFinite(until) || Date.now() < from || Date.now() >= until ||
        leaf.ca || !root.ca || !leaf.checkIssued(root) || !leaf.verify(root.publicKey) ||
        !leaf.checkPrivateKey(createPrivateKey(key)) ||
        !leaf.checkHost("localhost", { subject: "never", wildcards: false }) ||
        !leaf.checkIP("127.0.0.1")) return reject();
    const context = createSecureContext({ key, cert, minVersion: "TLSv1.2" });
    return { key, cert, ca, context, from, until };
  } catch { key.fill(0); cert.fill(0); ca.fill(0); return reject(); }
}

export function assertLocalTlsMaterial(input: LocalTlsMaterial): void {
  const checked = material(input);
  checked.key.fill(0); checked.cert.fill(0); checked.ca.fill(0);
}

function respond(response: ServerResponse, status: number) {
  if (response.headersSent) { response.destroy(); return; }
  if (status === 405) response.setHeader("Allow", "GET, HEAD");
  response.writeHead(status, {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", Connection: "close",
  });
  response.end('{"error":"Request rejected."}');
}

// Internal transport, NOT a gateway/role authorization capability. No HTTP
// backend, proxy, redirects, auth endpoint, upgrade or forwarded transport trust.
export function createLocalHttpsHost(port: number, origins: LocalOrigins, tls: LocalTlsMaterial, handler: Handler, authentication?: Handler, inventory?: Handler, pages?: Handler) {
  const m = material(tls);
  let stopping = false, listening = false;
  const sockets = new Set<Duplex>(), active = new Set<Promise<void>>();
  const server = https.createServer({
    key: m.key, cert: m.cert, minVersion: "TLSv1.2", maxHeaderSize: 8192,
    handshakeTimeout: 5000, requestTimeout: 10000, headersTimeout: 5000,
    keepAliveTimeout: 1000,
    SNICallback(name, done) {
      if (name !== "localhost") { done(new LocalRuntimeRejected()); return; }
      done(null, m.context);
    },
  }, (request, response) => {
    const socket = request.socket as TLSSocket;
    // Check real transport BEFORE URL/routing/Next parsing. Never infer TLS from
    // Host, X-Forwarded-*, Forwarded or a caller-supplied HTTPS URL.
    const now = Date.now(), host = request.headers.host;
    const role = host === new URL(origins.ADMIN).host ? "ADMIN" :
      host === new URL(origins.SALESPERSON).host ? "SALESPERSON" : undefined;
    const rawNames = request.rawHeaders.filter((_, i) => i % 2 === 0).map(name => name.toLowerCase());
    const rawHosts = rawNames.filter(name => name === "host").length;
    const unsafeHeader = rawNames.some(h =>
      h === "forwarded" || h.startsWith("x-forwarded-") || h === "x-real-ip" || h === "x-original-url" || h === "x-rewrite-url");
    if (stopping) { respond(response, 503); return; }
    if (!socket.encrypted || socket.localAddress !== "127.0.0.1" || socket.remoteAddress !== "127.0.0.1" ||
        !Number.isSafeInteger(now) || now < m.from || now >= m.until ||
        rawNames.length > 64 || rawHosts !== 1 || !role || unsafeHeader ||
        (role === "ADMIN" ? socket.servername !== "localhost" : !!socket.servername) ||
        (request.headers.origin !== undefined && request.headers.origin !== origins[role])) {
      respond(response, 403); return;
    }
    // Only these exact private auth paths can supplement public liveness. The
    // runtime supplies this dispatcher ONLY for validated isolated TEST storage.
    const authPath = authentication && (request.url === "/api/auth/login" || request.url === "/api/auth/logout" || request.url === "/api/auth/session");
    const inventoryPath = inventory && request.url && (isInventoryApiPath(request.url)||(isSalesApiPath(request.url)||isReturnsApiPath(request.url)||isExpensesApiPath(request.url)||isInvoicesApiPath(request.url)||isReportsApiPath(request.url)||isCashApiPath(request.url)));
    const pagePath = pages && request.url && isInventoryPagePath(request.url);
    const dispatch = request.url === "/api/health" ? handler : authPath ? authentication : inventoryPath ? inventory : pagePath ? pages : undefined;
    if (!dispatch) { respond(response, 404); return; }
    if (!authPath && !inventoryPath && !pagePath) {
      if (request.method !== "GET" && request.method !== "HEAD") { respond(response, 405); return; }
      if (request.headers["transfer-encoding"] !== undefined ||
          (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0") ||
          request.headers.upgrade !== undefined) { respond(response, 400); return; }
    }
    request.on("error", () => {}); // Aborted/rejected bodies never emit an unhandled stream error.
    response.on("error", () => response.destroy());
    const context = Object.freeze({ role, origin: origins[role], isLive: () => !stopping });
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const finished = new Promise<void>(resolve => { response.once("finish", resolve); response.once("close", resolve); });
    const work = Promise.resolve().then(() => dispatch(request, response, context)).catch(() => respond(response, 503));
    const task = Promise.allSettled([finished, work]).then(() => {});
    active.add(task); void task.finally(() => active.delete(task));
  });
  m.key.fill(0); m.cert.fill(0); m.ca.fill(0);
  server.maxHeadersCount = 64;
  server.on("connection", socket => {
    sockets.add(socket); socket.once("close", () => sockets.delete(socket));
    if (stopping || sockets.size > 64) socket.destroy();
  });
  // Registered before Next's supported handler can attach its upgrade listener.
  // Destroying the real socket prevents either listener from serving an upgrade.
  server.on("upgrade", (_request, socket) => socket.destroy());
  server.on("clientError", (_error, socket) => socket.destroy());
  server.on("tlsClientError", (_error, socket) => socket.destroy());
  let closed: Promise<void> | undefined;
  return {
    server, // INTERNAL only: supplied to Next's documented httpServer option.
    async listen() {
      try {
        await new Promise<void>((resolve, fail) => {
          server.once("error", fail);
          server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
            server.removeListener("error", fail); listening = true; resolve();
          });
        });
        server.on("error", () => { stopping = true; for (const socket of sockets) socket.destroy(); });
        const address = server.address();
        if (!address || typeof address === "string" || address.address !== "127.0.0.1" || address.port !== port) return reject();
      } catch { return reject(); }
    },
    close() {
      closed ??= (async () => {
        stopping = true; // Synchronous admission stop, including existing keep-alive sockets.
        const stopped = listening ? new Promise<void>((resolve, fail) => server.close(error => error ? fail(new LocalRuntimeRejected()) : resolve())) : Promise.resolve();
        await Promise.allSettled([...active]); // Never tear down an admitted handler/write.
        for (const socket of sockets) socket.destroy(); // Idle/incomplete TLS only after drain.
        await stopped;
      })();
      return closed;
    },
  };
}
