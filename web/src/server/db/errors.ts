import "server-only";

export class DatabaseFoundationError extends Error {
  readonly sqliteCode?: string;

  constructor(readonly code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "DatabaseFoundationError";
    if (cause && typeof cause === "object" && "code" in cause) {
      const code = cause.code;
      if (typeof code === "string" && /^SQLITE_[A-Z_]+$/.test(code)) this.sqliteCode = code;
    }
  }
}
