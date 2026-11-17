import "server-only";

// Comparison lexer, not an SQL authorizer/parser. Only reviewed DDL is authority.
// Literal/quoted-token contents are preserved; layout/comments are not semantics.
export function schemaTokens(sql: string): string {
  if (typeof sql !== "string" || sql.length > 65536 || sql.includes("\0")) throw new Error("Invalid schema text.");
  const tokens: string[] = [];
  // Exact ASCII predicates from the original regular expressions; all quoted
  // text, comments, bounds and rejection paths remain unchanged.
  const word=(n:number)=>n>=48&&n<=57||n>=65&&n<=90||n>=97&&n<=122||n===95;
  for (let i = 0; i < sql.length;) {
    const c = sql[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f") { i++; continue; }
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
    } else if (word(sql.charCodeAt(i))) {
      const start = i++; while (i < sql.length && (word(sql.charCodeAt(i)) || sql.charCodeAt(i)===36)) i++;
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
