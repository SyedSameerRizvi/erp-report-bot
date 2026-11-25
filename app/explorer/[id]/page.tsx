import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import ResultView, { type Result } from "@/components/ResultView";
import Rerun from "@/components/Rerun";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = await getDb();
  const [r] = await db.query("SELECT * FROM app.report_runs WHERE id = $1", [id]);
  if (!r) notFound();
  const snap = (r.result_snapshot ?? { columns: [], rows: [], truncated: false }) as { columns: string[]; rows: Record<string, unknown>[]; truncated: boolean };
  const result: Result = {
    runId: id, status: String(r.status), question: String(r.question), answer: String(r.answer ?? ""), sql: String(r.sql ?? ""),
    columns: snap.columns, rows: snap.rows, truncated: snap.truncated, chart: r.chart as Result["chart"],
    defaultView: (r.default_view ?? "table") as Result["defaultView"], error: (r.error as string) ?? undefined,
    model: String(r.model ?? ""), latencyMs: Number(r.latency_ms ?? 0),
  };
  return (
    <div className="page">
      <p className="meta"><Link href="/explorer">← Report Explorer</Link></p>
      <h1>{String(r.title ?? r.question)}</h1>
      <p className="sub">Run #{id} · {new Date(r.created_at as string).toLocaleString()} · {Number(r.prompt_tokens ?? 0) + Number(r.completion_tokens ?? 0)} tokens</p>
      <ResultView result={result} />
      <Rerun question={result.question} />
    </div>
  );
}
