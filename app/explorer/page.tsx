import Link from "next/link";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUSES = ["ok", "cache_hit", "clarify", "info", "refused", "failed"];

export default async function Explorer({ searchParams }: { searchParams: Promise<{ status?: string; saved?: string; q?: string }> }) {
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status ?? "") ? sp.status! : null;
  const savedOnly = sp.saved === "1";
  const q = (sp.q ?? "").trim().slice(0, 100) || null;
  const db = await getDb();
  const runs = await db.query(
    `SELECT id, created_at, question, title, status, model, latency_ms, prompt_tokens + completion_tokens AS tokens, row_count, saved
     FROM app.report_runs WHERE ($1::text IS NULL OR status = $1) AND (NOT $2 OR saved)
       AND ($3::text IS NULL OR question ILIKE '%' || $3 || '%' OR title ILIKE '%' || $3 || '%')
     ORDER BY created_at DESC LIMIT 200`, [status, savedOnly, q]);
  const [stats] = await db.query(
    `SELECT count(*) AS n, count(*) FILTER (WHERE status = 'cache_hit') AS hits, count(*) FILTER (WHERE status = 'failed') AS failed,
            count(*) FILTER (WHERE status = 'refused') AS refused, coalesce(sum(prompt_tokens + completion_tokens), 0) AS tokens FROM app.report_runs`);
  const link = (p: Record<string, string | null>) => {
    const qs = new URLSearchParams(Object.entries({ status, saved: savedOnly ? "1" : null, q, ...p }).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `/explorer?${qs}` : "/explorer";
  };

  return (
    <div className="page">
      <h1>Report Explorer</h1>
      <p className="sub">Every question asked: the SQL it ran, how long it took, what it cost. Save the useful ones.{q ? ` Showing matches for “${q}”.` : ""}</p>
      <p className="meta">{String(stats.n)} runs · {String(stats.hits)} cache hits · {String(stats.refused)} refused · {String(stats.failed)} failed · {Number(stats.tokens).toLocaleString()} tokens</p>
      <div className="filters">
        <Link href={link({ status: null })} aria-current={!status ? "page" : undefined}>All</Link>
        {STATUSES.map(s => <Link key={s} href={link({ status: s })} aria-current={status === s ? "page" : undefined}>{s.replace("_", " ")}</Link>)}
        <span>·</span>
        <Link href={link({ saved: savedOnly ? null : "1" })}>{savedOnly ? "Show all" : "Saved only"}</Link>
      </div>
      <div className="card table-wrap" style={{ maxHeight: "none" }}>
        {runs.length === 0 ? <p className="meta">No runs yet. <Link href="/">Ask a question</Link>.</p> : (
          <table className="runs">
            <thead><tr><th scope="col">Question</th><th scope="col">Status</th><th scope="col">Rows</th><th scope="col">Latency</th><th scope="col">Tokens</th><th scope="col">When</th></tr></thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={String(r.id)} style={{ "--i": i } as React.CSSProperties}>
                  <td><Link href={`/explorer/${r.id}`}>{r.saved ? "★ " : ""}{String(r.title ?? r.question)}</Link></td>
                  <td><span className={`badge ${r.status}`}>{String(r.status).replace("_", " ")}</span></td>
                  <td className="num">{String(r.row_count ?? 0)}</td>
                  <td className="num">{String(r.latency_ms)} ms</td>
                  <td className="num">{Number(r.tokens ?? 0).toLocaleString()}</td>
                  <td className="meta">{new Date(r.created_at as string).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
