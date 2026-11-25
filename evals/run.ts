// npm run eval -- [--model <groq id>] [--no-retry] [--bucket easy|medium|hard|refuse] [--limit N] [--gold-only]
// Runs every question through the real pipeline (no cache, no logging), scores it against gold SQL,
// writes evals/results/<label>.json and refreshes the results table in README.md.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { ask, runSql, type AskResult } from "../lib/pipeline";
import { BIG_MODEL, RateLimitError, isMock } from "../lib/llm";
import { resultsMatch } from "./compare";

type Q = { id: string; bucket: "easy" | "medium" | "hard" | "refuse"; question: string; gold_sql?: string; expect?: "REFUSE" };
type Outcome = "correct" | "wrong" | "safe_fail" | "refused_ok" | "answered_bad";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const model = opt("model") ?? BIG_MODEL;
const retry = !flag("no-retry");
const label = opt("label") ?? `${isMock() ? "mock" : model.replace(/\W+/g, "-")}${retry ? "" : "-noretry"}`;
let qs: Q[] = readFileSync(new URL("./questions.jsonl", import.meta.url), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l));
if (opt("bucket")) qs = qs.filter(q => q.bucket === opt("bucket"));
if (opt("limit")) qs = qs.slice(0, Number(opt("limit")));

async function askWithBackoff(q: string): Promise<AskResult> {
  for (let i = 0; ; i++) {
    try {
      return await ask(q, { bypassCache: true, log: false, skipSummary: true, model, retry });
    } catch (e) {
      if (e instanceof RateLimitError && i < 8) { process.stdout.write(` [429, waiting ${e.retryAfterSec}s]`); await sleep(e.retryAfterSec * 1000 + 500); continue; }
      throw e;
    }
  }
}

const results: { id: string; bucket: string; outcome: Outcome; status: string; latencyMs: number; tokens: number; sql: string; error?: string }[] = [];
for (const q of qs) {
  process.stdout.write(`${q.id} ${q.question.slice(0, 60).padEnd(60)} `);
  const gold = q.gold_sql ? await runSql(q.gold_sql).catch(e => { throw new Error(`GOLD SQL BROKEN for ${q.id}: ${e.message}`); }) : null;
  if (flag("gold-only")) { console.log(gold ? `${gold.rows.length} rows ${JSON.stringify(gold.rows[0])}` : "REFUSE"); continue; }
  let r: AskResult;
  try { r = await askWithBackoff(q.question); } catch (e) {
    results.push({ id: q.id, bucket: q.bucket, outcome: q.expect ? "refused_ok" : "safe_fail", status: "error", latencyMs: 0, tokens: 0, sql: "", error: (e as Error).message });
    console.log(`ERROR ${(e as Error).message.slice(0, 80)}`);
    continue;
  }
  const outcome: Outcome = q.expect === "REFUSE"
    ? (r.status === "ok" ? "answered_bad" : "refused_ok")
    : r.status !== "ok" ? "safe_fail" : resultsMatch(r.rows, gold!.rows) ? "correct" : "wrong";
  results.push({ id: q.id, bucket: q.bucket, outcome, status: r.status, latencyMs: r.latencyMs, tokens: r.usage.prompt + r.usage.completion, sql: r.sql, error: r.error });
  console.log(`${outcome.padEnd(12)} ${r.latencyMs}ms`);
}
if (flag("gold-only")) process.exit(0);

const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 1000) / 10}%` : "–";
const answerable = results.filter(r => r.bucket !== "refuse");
const refusals = results.filter(r => r.bucket === "refuse");
const lat = results.map(r => r.latencyMs).filter(Boolean).sort((a, b) => a - b);
const q = (p: number) => lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0;
const summary = {
  label, model: isMock() ? "mock" : model, retry, ranAt: new Date().toISOString(), n: results.length,
  accuracy: pct(answerable.filter(r => r.outcome === "correct").length, answerable.length),
  byBucket: Object.fromEntries(["easy", "medium", "hard"].map(b => { const xs = answerable.filter(r => r.bucket === b); return [b, pct(xs.filter(r => r.outcome === "correct").length, xs.length)]; })),
  wrongAnswerRate: pct(answerable.filter(r => r.outcome === "wrong").length, answerable.length),
  safeFailRate: pct(answerable.filter(r => r.outcome === "safe_fail").length, answerable.length),
  refusalCorrect: pct(refusals.filter(r => r.outcome === "refused_ok").length, refusals.length),
  p50ms: q(0.5), p95ms: q(0.95),
  avgTokens: Math.round(results.reduce((s, r) => s + r.tokens, 0) / (results.length || 1)),
};
console.log("\n", summary);

mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
writeFileSync(new URL(`./results/${slug}.json`, import.meta.url), JSON.stringify({ summary, results }, null, 2));

// README table: one row per result file (latest run per config)
const dir = new URL("./results/", import.meta.url);
const rows = readdirSync(dir).filter(f => f.endsWith(".json")).map(f => JSON.parse(readFileSync(new URL(f, dir), "utf8")).summary as typeof summary)
  .sort((a, b) => a.ranAt.localeCompare(b.ranAt));
const table = [
  "| Config | Accuracy | Easy | Medium | Hard | Wrong answers | Safe fails | Refusals correct | p50 / p95 latency | Avg tokens |",
  "|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map(s => `| ${s.label} | **${s.accuracy}** | ${s.byBucket.easy} | ${s.byBucket.medium} | ${s.byBucket.hard} | ${s.wrongAnswerRate} | ${s.safeFailRate} | ${s.refusalCorrect} | ${s.p50ms} / ${s.p95ms} ms | ${s.avgTokens} |`),
].join("\n");
const readme = new URL("../README.md", import.meta.url);
if (existsSync(readme)) {
  const txt = readFileSync(readme, "utf8");
  writeFileSync(readme, txt.replace(/<!-- EVAL:START -->[\s\S]*<!-- EVAL:END -->/, `<!-- EVAL:START -->\n${table}\n<!-- EVAL:END -->`));
}
process.exit(0);
