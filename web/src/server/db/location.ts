import "server-only";

import { existsSync, lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseFoundationError } from "./errors";

export interface DatabaseOptions {
  directory: string;
  filename: string;
  mode: "persistent" | "test";
  create?: boolean;
  busyTimeoutMs?: number;
}

export function within(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative));
}

export function rejectRedirectedPath(directory: string): void {
  for (let current = directory; ; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("Redirected directory.");
    if (path.dirname(current) === current) break;
  }
}

export function resolveDatabaseLocation(options: DatabaseOptions): { filename: string; busyTimeoutMs: number } {
  try {
    const keys = ["directory", "filename", "mode", "create", "busyTimeoutMs"];
    if (!options || Object.keys(options).some((key) => !keys.includes(key))) throw new Error("Unknown configuration.");
    const { directory, filename, mode, create = false, busyTimeoutMs = 5000 } = options;
    if (
      typeof directory !== "string" || directory !== directory.trim() ||
      !path.isAbsolute(directory) || directory.startsWith("\\\\") ||
      typeof filename !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\.(?:db|sqlite|sqlite3)$/.test(filename) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(filename) ||
      typeof create !== "boolean" || !Number.isSafeInteger(busyTimeoutMs) ||
      busyTimeoutMs < 0 || busyTimeoutMs > 5000 || (mode !== "persistent" && mode !== "test")
    ) throw new Error("Invalid database configuration.");

    const resolved = path.resolve(directory);
    rejectRedirectedPath(resolved);
    const canonical = realpathSync.native(resolved);
    if (canonical.toLowerCase() !== resolved.toLowerCase()) throw new Error("Directory is redirected.");
    if (mode === "test") {
      const root = path.resolve(process.cwd(), "test-results/sqlite-b1b-part1");
      if (process.env.NODE_ENV !== "test" || !within(canonical, root) || path.relative(root, canonical) === "") {
        throw new Error("TEST databases require an isolated test-run directory.");
      }
    } else {
      const roots = [process.env.LOCALAPPDATA, process.env.ProgramData].filter(
        (root): root is string => typeof root === "string" && path.isAbsolute(root),
      );
      const forbidden = [
        tmpdir(), process.cwd(), fileURLToPath(new URL("../../../../", import.meta.url)),
        process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial,
      ].filter((root): root is string => typeof root === "string" && path.isAbsolute(root));
      if (
        !roots.some((root) => within(canonical, root) && path.relative(root, canonical) !== "") ||
        forbidden.some((root) => within(canonical, root)) ||
        canonical.split(path.sep).some((part) => /^(?:public|static|src|source|node_modules|\.next|\.git|build|dist|out|temp|tmp|onedrive.*|dropbox|google drive|icloud(?:drive)?|box sync)$/i.test(part))
      ) throw new Error("Persistent databases require a dedicated local application-data directory.");
    }

    const target = path.join(canonical, filename);
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      let stat;
      try { stat = lstatSync(target + suffix); } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") continue;
        throw error;
      }
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1) {
        throw new Error("Database and sidecars must be regular single-link files.");
      }
    }
    if (!create && !existsSync(target)) throw new Error("Database creation must be explicit.");
    return { filename: target, busyTimeoutMs };
  } catch (cause) {
    throw new DatabaseFoundationError("PATH_INVALID", "Database location or configuration was rejected.", cause);
  }
}
