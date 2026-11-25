// Cheap pre-flight check before any model SQL touches the DB. Defense in depth:
// the real boundary is the read-only transaction + report_reader role (SELECT on reports.* only).
export type GuardResult = { ok: true; sql: string } | { ok: false; reason: string };

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|grant|revoke|truncate|copy|merge|call|vacuum|analyze|lock|listen|notify|prepare|execute|set|reset|comment|security|pg_sleep|dblink|lo_import|lo_export)\b/i;
const FORBIDDEN_REFS = /\b(pg_\w+|information_schema|erp|app|public)\s*\.|\bpg_\w+\s*\(|\binformation_schema\b|\bpg_catalog\b/i;

// Remove -- and /* */ comments outside string literals (models annotate complex SQL; comments are harmless once gone).
const stripComments = (s: string) =>
  s.replace(/('(?:[^']|'')*')|("(?:[^"]|"")*")|--[^\n]*|\/\*[\s\S]*?\*\//g, (m, sq, dq) => sq ?? dq ?? " ");

export function guardSql(raw: string): GuardResult {
  const sql = stripComments(raw).trim().replace(/;+\s*$/, "").trim();
  if (!sql) return { ok: false, reason: "empty query" };
  if (/\/\*/.test(sql)) return { ok: false, reason: "unterminated comment" };
  const code = sql.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""'); // ignore text inside literals
  if (code.includes(";")) return { ok: false, reason: "only one statement is allowed" };
  if (!/^\s*\(?\s*(select|with)\b/i.test(code)) return { ok: false, reason: "only SELECT queries are allowed" };
  const bad = code.match(FORBIDDEN);
  if (bad) return { ok: false, reason: `keyword not allowed: ${bad[1].toUpperCase()}` };
  if (FORBIDDEN_REFS.test(code)) return { ok: false, reason: "only the reports views may be queried" };
  return { ok: true, sql };
}

export const normalizeQuestion = (q: string) => q.toLowerCase().replace(/\s+/g, " ").replace(/[?.!\s]+$/, "").trim();
