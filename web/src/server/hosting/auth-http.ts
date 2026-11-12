import "server-only";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthorizationGateway } from "../auth/types";
import { isValidPasswordInput } from "../auth/password-policy";
import { resolveDatabaseLocation, type DatabaseOptions } from "../db/location";
import type { LocalRequestContext } from "./https";

// No env enable flag, persistent DB activation, setup ceremony or default key.
// A TEST mode switch alone is insufficient: the existing path validator also
// requires NODE_ENV=test, an existing isolated workspace TEST directory/file,
// no redirected/hard-linked paths and all the established location constraints.
export function confinedTestAuthentication(database: DatabaseOptions): boolean {
  if (database.mode !== "test") return false;
  try { resolveDatabaseLocation({ ...database, create: false }); return true; }
  catch { return false; }
}

const maxBodyBytes = 2048, bodyLifetimeMs = 5000;
const rejected = () => new Error("Request rejected.");
const successBody = '{"ok":true}';
function send(response: ServerResponse, status: number, allowed = "POST") {
  if (response.destroyed || response.headersSent) { response.destroy(); return; }
  if (status === 405) response.setHeader("Allow", allowed);
  response.writeHead(status, {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff", Connection: "close",
  });
  response.end('{"error":"Authentication failed."}');
}
function readJson(request: IncomingMessage): Promise<{ raw: string; value: unknown }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0, done = false;
    const finish = (failed: boolean) => {
      if (done) return; done = true; clearTimeout(timer);
      request.removeListener("data", data); request.removeListener("end", end);
      request.removeListener("aborted", abort); request.removeListener("error", abort);
      let combined: Buffer | undefined;
      try {
        if (failed) { request.pause(); throw rejected(); }
        combined = Buffer.concat(chunks, size);
        // Preserve BOM so JSON.parse rejects it; malformed UTF-8 is never replaced.
        const raw = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(combined);
        resolve({ raw, value: JSON.parse(raw) });
      } catch { reject(rejected()); }
      finally { combined?.fill(0); for (const chunk of chunks) chunk.fill(0); }
    };
    const data = (chunk: Buffer) => {
      if (!Buffer.isBuffer(chunk) || size + chunk.length > maxBodyBytes) { finish(true); return; }
      size += chunk.length; chunks.push(Buffer.from(chunk));
    };
    const end = () => finish(false), abort = () => finish(true);
    const timer = setTimeout(abort, bodyLifetimeMs); timer.unref();
    request.on("data", data); request.once("end", end);
    request.once("aborted", abort); request.once("error", abort);
    if (request.aborted) finish(true);
  });
}
function incomingSession(request: IncomingMessage, context: LocalRequestContext, cookies?: readonly string[]) {
  return new Request(context.origin + "/api/auth/logout", {
    method: "POST", headers: {
      origin: context.origin, host: new URL(context.origin).host,
      cookie: cookies ? cookies.map(cookie => cookie.split(";")[0]).join("; ") : request.headers.cookie ?? "",
    },
  });
}
function checkHeaders(request: IncomingMessage, context: LocalRequestContext) {
  const names = request.rawHeaders.filter((_, i) => i % 2 === 0).map(name => name.toLowerCase());
  if (names.filter(name => name === "origin").length !== 1 || request.headers.origin !== context.origin ||
      names.filter(name => name === "content-type").length !== 1 ||
      names.filter(name => name === "cookie").length > 1 ||
      (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "same-origin")) return 403;
  const type = request.headers["content-type"];
  if (typeof type !== "string" || !/^application\/json(?:;\s*charset=utf-8)?$/i.test(type) ||
      request.headers["content-encoding"] !== undefined) return 415;
  const length = request.headers["content-length"];
  if (length !== undefined && (typeof length !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(length) ||
      !Number.isSafeInteger(Number(length)) || Number(length) > maxBodyBytes)) return 413;
  const encoding = request.headers["transfer-encoding"];
  if (encoding !== undefined && encoding !== "chunked") return 400;
  // Ambiguous cookie names have no reliable current-session identity.
  const cookieNames = (request.headers.cookie ?? "").split(";").filter(Boolean).map(value => value.trim().split("=")[0]);
  if (new Set(cookieNames).size !== cookieNames.length) return 403;
}
// Read-only status has no JSON body and does not require an Origin header on
// ordinary same-origin browser GETs. Any supplied Origin/Fetch Metadata must
// still match; duplicate cookies/headers and body framing are rejected.
function checkStatusHeaders(request: IncomingMessage, context: LocalRequestContext) {
  const names = request.rawHeaders.filter((_, i) => i % 2 === 0).map(name => name.toLowerCase());
  if (names.filter(name => name === "origin").length > 1 ||
      (request.headers.origin !== undefined && request.headers.origin !== context.origin) ||
      names.filter(name => name === "cookie").length > 1 ||
      (request.headers["sec-fetch-site"] !== undefined && request.headers["sec-fetch-site"] !== "same-origin")) return 403;
  if (request.headers["transfer-encoding"] !== undefined || request.headers["content-encoding"] !== undefined ||
      (request.headers["content-length"] !== undefined && request.headers["content-length"] !== "0")) return 400;
  const cookieNames = (request.headers.cookie ?? "").split(";").filter(Boolean).map(value => value.trim().split("=")[0]);
  if (new Set(cookieNames).size !== cookieNames.length) return 403;
}
async function sessionStatus(request: IncomingMessage, response: ServerResponse, context: LocalRequestContext, gateway: AuthorizationGateway) {
  if (request.method !== "GET") { send(response, 405, "GET"); return; }
  const failure = checkStatusHeaders(request, context);
  if (failure) { send(response, failure); return; }
  const live = () => context.isLive() && !request.aborted && !response.destroyed;
  if (!live()) { send(response, 503); return; }
  let authenticated = false;
  try {
    const session = new Request(context.origin + "/api/auth/session", {
      headers: { origin: context.origin, host: new URL(context.origin).host, cookie: request.headers.cookie ?? "" },
    });
    // SAME serialized gateway: actual framework signature plus authoritative
    // SQLite provisioning, role, version/epoch, boot, expiry and revocation.
    // Discard the internal Actor. Never publish it or refresh a cookie here.
    if (context.role === "ADMIN") await gateway.authorizeAdmin(session);
    else await gateway.authorizeSalesperson(session);
    authenticated = true;
  } catch { /* Absent/invalid session and unavailable SQL all deny generically. */ }
  if (!live()) { send(response, 503); return; }
  response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(authenticated ? '{"authenticated":true}' : '{"authenticated":false}');
  // This is a snapshot, not authority for a later page/API/business operation.
}
async function publish(source: Response, response: ServerResponse, context: LocalRequestContext) {
  const prefix = context.role === "ADMIN" ? "__Secure-pos-admin." : "__Secure-pos-salesperson.";
  const cookies = source.headers.getSetCookie();
  if (source.status !== 200 || await source.text() !== successBody || cookies.length === 0 ||
      cookies.some(cookie => !cookie.startsWith(prefix) || /[\r\n]/.test(cookie) || /(?:^|;)\s*Domain=/i.test(cookie) ||
        !/(?:^|;)\s*Secure(?:;|$)/i.test(cookie) || !/(?:^|;)\s*HttpOnly(?:;|$)/i.test(cookie) ||
        !/(?:^|;)\s*SameSite=Strict(?:;|$)/i.test(cookie) || !/(?:^|;)\s*Path=\/(?:;|$)/i.test(cookie))) throw rejected();
  if (!context.isLive() || response.destroyed) throw rejected();
  // Native gateway COMMIT has already succeeded. Preserve each Set-Cookie header;
  // never fold them into one comma-delimited value or copy token-bearing JSON.
  response.setHeader("Set-Cookie", cookies);
  response.setHeader("Content-Type", "application/json");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  await new Promise<void>((resolve, reject) => {
    const finish = () => resolve(), close = () => response.writableFinished ? resolve() : reject(rejected());
    response.once("finish", finish); response.once("close", close);
    response.once("error", () => reject(rejected()));
    response.writeHead(200); response.end(successBody);
  });
}

// INTERNAL trusted runtime construction only. No database, extra gateway, callback
// verifier, role/account/hash argument, auth.api or framework handler is returned.
export function createAuthenticationDispatcher(gateway: AuthorizationGateway) {
  let loginBusy = false; // One admitted verify+receipt+issue flow; no native-work queue.
  return async (request: IncomingMessage, response: ServerResponse, context: LocalRequestContext) => {
    if (request.url === "/api/auth/session") { await sessionStatus(request, response, context, gateway); return; }
    if (request.url !== "/api/auth/login" && request.url !== "/api/auth/logout") { send(response, 404); return; }
    if (request.method !== "POST") { send(response, 405); return; }
    const headerFailure = checkHeaders(request, context);
    if (headerFailure) { send(response, headerFailure); return; }
    const logout = (session: Request) => context.role === "ADMIN" ? gateway.logoutAdmin(session) : gateway.logoutSalesperson(session);
    const live = () => { if (!context.isLive() || request.aborted || response.destroyed) throw rejected(); };
    let staged: Response | undefined, admitted = false;
    try {
      let parsed: Awaited<ReturnType<typeof readJson>>;
      try { parsed = await readJson(request); } catch { send(response, 400); return; }
      const { value, raw } = parsed;
      live();
      if (!value || typeof value !== "object" || Array.isArray(value)) { send(response, 400); return; }
      if (request.url === "/api/auth/logout") {
        if (Object.keys(value).length !== 0) { send(response, 400); return; }
        staged = await logout(incomingSession(request, context));
        await publish(staged, response, context);
      } else {
        // Native JSON parsing plus a deliberately one-member envelope: reject
        // duplicate/escaped keys and extra identities, while preserving the exact
        // decoded password string (including whitespace, NUL and Unicode).
        if (Object.keys(value).length !== 1 || !Object.hasOwn(value, "password") ||
            !/^\s*\{\s*"password"\s*:\s*"(?:[^"\\]|\\[\s\S])*"\s*\}\s*$/.test(raw)) { send(response, 400); return; }
        const password: unknown = (value as Record<string, unknown>).password;
        if (!isValidPasswordInput(password)) { send(response, 400); return; }
        if (loginBusy) throw rejected();
        admitted = loginBusy = true;
        // Existing gateway charges durable attempts BEFORE the actual native KDF.
        const receipt = context.role === "ADMIN" ? await gateway.verifyAdminPassword(password) : await gateway.verifySalespersonPassword(password);
        live();
        staged = context.role === "ADMIN" ? await gateway.issueAdminSession(receipt) : await gateway.issueSalespersonSession(receipt);
        live();
        await publish(staged, response, context);
      }
      staged = undefined;
    } catch {
      if (staged && request.url === "/api/auth/login") {
        // A closed socket, shutdown or response-publication failure must not leave
        // an undisclosed issued session live. SQL uncertainty in private logout
        // quarantines the existing gateway; shutdown also invalidates all RAM.
        try { await logout(incomingSession(request, context, staged.headers.getSetCookie())); } catch { /* No success or cookie is published here. */ }
      }
      if (!response.headersSent) response.removeHeader("Set-Cookie");
      send(response, 401); // Same for wrong password, cooldown, SQL/fault or stale state.
    } finally { if (admitted) loginBusy = false; }
  };
}
