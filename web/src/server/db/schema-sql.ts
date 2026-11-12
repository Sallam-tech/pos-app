import "server-only";

// Comparison lexer, not an SQL authorizer/parser. Only reviewed DDL is authority.
// Literal/quoted-token contents are preserved; layout/comments are not semantics.
export function schemaTokens(sql: string): string {
  if (typeof sql !== "string" || sql.length > 65536 || sql.includes("\0")) throw new Error("Invalid schema text.");
  const tokens: string[] = [];
  for (let i = 0; i < sql.length;) {
    const c = sql[i];
    if (/[ \t\n\r\f]/.test(c)) { i++; continue; }
    if (sql.startsWith("--", i)) { const end = sql.indexOf("\n", i + 2); i = end < 0 ? sql.length : end + 1; continue; }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2); if (end < 0) throw new Error("Unclosed schema comment.");
      i = end + 2; continue;
    }
    if (c === "'" || c === '"' || c.charCodeAt(0) === 96 || c === "[") {
      const start = i++, end = c === "[" ? "]" : c;
      let closed = false;
      while (i < sql.length) {
        if (sql[i++] !== end) continue;
        if (c !== "[" && sql[i] === end) { i++; continue; }
        closed = true; break;
      }
      if (!closed) throw new Error("Unclosed schema token.");
      tokens.push(sql.slice(start, i));
    } else if (/[a-zA-Z_0-9]/.test(c)) {
      const start = i++; while (i < sql.length && /[a-zA-Z_0-9$]/.test(sql[i])) i++;
      tokens.push(sql.slice(start, i).toLowerCase());
    } else {
      const pair = sql.slice(i, i + 2);
      if (["<=", ">=", "!=", "<>", "||", "<<", ">>"].includes(pair)) { tokens.push(pair); i += 2; }
      else if ("(),;=<>!+-*/%~&|.".includes(c)) { tokens.push(c); i++; }
      else throw new Error("Unsupported schema token.");
    }
    if (tokens.length > 16384) throw new Error("Schema text exceeds comparison budget.");
  }
  if (tokens.at(-1) === ";") tokens.pop();
  if (!tokens.length || tokens.includes(";")) throw new Error("Ambiguous schema statement.");
  return JSON.stringify(tokens);
}
