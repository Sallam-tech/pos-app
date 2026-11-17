// TEST ONLY. Real fresh-process restart with an IPC-only privileged test control plane.
// Credentials travel only in volatile IPC memory, never arguments, files or stdout.
import { host, containsSecret } from "./host.mjs";
let server;
const consoleOutput = [];
for (const name of ["log", "warn", "error", "info", "debug"]) console[name] = (...args) => consoleOutput.push(args);
process.on("message", async message => {
  try {
    let value;
    if (message.action === "init") {
      server = await host(message.options); value = { ready: true };
    } else if (message.action === "issue") {
      const login = await server.issue();
      value = { cookie: login.headers.get("cookie"), token: login.token, count: server.test.records().length };
    } else if (message.action === "request") {
      const response = await server.request(message.path, new Headers({ cookie: message.cookie }), message.method ?? "GET");
      value = { status: response.status, body: await response.text(), cookies: response.headers.getSetCookie() };
    } else if (message.action === "audit") {
      value = {
        diskHasSecret: server.test.diskHasSecret(),
        logHasSecret: containsSecret(JSON.stringify([...consoleOutput, ...server.test.logs])),
        gateReads: server.test.metrics.sqlGateReads,
        records: server.test.records().length, ramEntries: server.test.ram.size()
      };
    } else if (message.action === "close") {
      await server.close(); value = { closed: true };
    } else throw new Error("TEST_INVALID_COMMAND");
    process.send({ id: message.id, ok: true, value });
  } catch { process.send({ id: message.id, ok: false, error: "TEST_WORKER_OPERATION_FAILED" }); }
});
process.on("disconnect", () => { process.exit(0); });
