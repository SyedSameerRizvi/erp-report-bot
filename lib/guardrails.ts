// AI guardrails around the model calls. Layers, cheapest first:
//   1. checkInput: refuse prompt-injection / prompt-extraction attempts before any model call
//   2. the planner prompt: ERP-only scope, refuse everything else (lib/pipeline.ts)
//   3. guardSql + read-only role (lib/sql-guard.ts, lib/pipeline.ts)
//   4. checkSummary: the answer sentence may only state numbers that are in the result, and no links/markup
//   5. overQuota: per-user hourly cap on fresh (non-cached) questions
import type { Row } from "./db";

export const OFF_TOPIC = "That's outside what I can help with. I answer questions about the company's ERP data: sales, customers, products and stock, suppliers and purchasing, and receivables.";
export const HOURLY_QUOTA = Number(process.env.ASK_HOURLY_QUOTA ?? 60);

const INJECTION = [
  /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(instructions?|rules|prompts?|guardrails?|restrictions)\b/i,
  /\b(system|developer|hidden)\s+(prompt|message|instructions?)\b/i,
  /\b(reveal|show|print|repeat|leak)\b.{0,30}\b(your|system)\b.{0,20}\b(prompt|instructions|rules)\b/i,
  /\byou are now\b|\bpretend (to be|you)\b|\bjailbreak\b|\bdeveloper mode\b|\bDAN mode\b/i,
];

export function checkInput(question: string): { ok: true } | { ok: false; reason: string } {
  // shortcut: quoted text is skipped so a question can name the seeded customer "Ignore previous instructions...";
  // the planner rules and the read-only role still apply to it.
  const unquoted = question.replace(/(["'“”‘’]).*?\1/g, " ");
  if (INJECTION.some(p => p.test(unquoted))) return { ok: false, reason: "I can't share or change my instructions. " + INTRO };
  return { ok: true };
}

const NUM = /\d[\d,]*(?:\.\d+)?/g;
const nums = (s: string) => (s.match(NUM) ?? []).map(x => Number(x.replace(/,/g, ""))).filter(Number.isFinite);

// The summary is written by a model reading untrusted rows: it must not invent numbers or carry links/markup.
export function checkSummary(summary: string, rows: Row[], question: string): boolean {
  if (/https?:\/\/|www\.|<[a-z/!]|\]\(|```/i.test(summary)) return false;
  const allowed: number[] = [rows.length, ...nums(question)];
  for (const r of rows.slice(0, 200)) for (const v of Object.values(r)) {
    if (typeof v === "number") allowed.push(Math.abs(v));
    else if (typeof v === "string") allowed.push(...nums(v));
  }
  const text = summary.replace(/\b\d{4}-\d{2}(-\d{2})?\b/g, " "); // ISO dates are checked as text below
  return nums(text).every(n =>
    n <= 31 || (n >= 1990 && n <= 2100 && Number.isInteger(n)) || // shortcut: small counts, days, quarters and years pass; tighten if they get abused
    allowed.some(v => Math.abs(n - v) <= Math.max(0.005 * v, 0.01) || Math.round(v) === n));
}

// A query can run fine and still be wrong: these results get one guided retry before we answer.
export function checkResult(rows: Row[]): string | null {
  if (!rows.length) return "returned no rows";
  if (rows.every(r => Object.values(r).every(v => v === null))) return "returned only empty (NULL) values";
  for (const r of rows) for (const [k, v] of Object.entries(r))
    if (typeof v === "number" && v < 0 && /revenue|amount|price|units|qty|quantity/i.test(k)) return `has a negative ${k} (${v})`;
  return null;
}

export const INTRO = "I'm the ERP Report Bot. Ask me about the company's sales and orders, customers, products and stock, suppliers and purchasing, " +
  "or invoices and receivables. I write a read-only query, run it on the ERP data and show the answer as text, a table or a chart. " +
  "Try \"Top 5 products by revenue last quarter\" or \"Which customers have overdue invoices?\"";
// Greetings and "who are you" get the intro without a model call; longer variants reach the planner, which returns INTRO too.
const SMALL_TALK = /^(hi|hello|hey|salaam|salam|assalam[a-z ]*|good (morning|afternoon|evening)|thanks|thank you|help|who are you|what are you|what can you do|what do you do|how (do|can) (i|you) (use|help)[a-z ]*|introduce yourself)\W*$/i;
export const isSmallTalk = (q: string) => SMALL_TALK.test(q.trim().replace(/\s+/g, " "));

export function fallbackSummary(rows: Row[]): string {
  if (rows.length === 1 && Object.keys(rows[0]).length === 1) {
    const v = Object.values(rows[0])[0];
    return `The answer is ${typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v)}.`;
  }
  return rows.length ? `Found ${rows.length.toLocaleString("en-US")} rows. See the table for details.` : "The query returned no rows.";
}

export async function overQuota(db: { query: (sql: string, p?: unknown[]) => Promise<Row[]> }, userId: string): Promise<boolean> {
  const [r] = await db.query(
    "SELECT count(*) AS n FROM app.report_runs WHERE user_id = $1 AND status <> 'cache_hit' AND created_at > now() - interval '1 hour'", [userId]);
  return Number(r.n) >= HOURLY_QUOTA;
}
