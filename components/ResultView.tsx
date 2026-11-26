"use client";
import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartSpec } from "@/lib/llm";

export type Result = {
  runId?: number; status: string; question: string; answer: string; sql: string;
  columns: string[]; rows: Record<string, unknown>[]; truncated: boolean;
  chart: ChartSpec; defaultView: "text" | "table" | "chart"; error?: string; model: string; latencyMs: number; options?: string[];
};

const COLORS = ["#2F6BFF", "#7C48F0", "#3AD0FF", "#5A4CF5", "#8FA8FF", "#B49CFF", "#1E4FD8", "#6E6E6E"];
const TIP = { contentStyle: { background: "#1A1A1A", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, color: "#fff" }, itemStyle: { color: "#fff" }, labelStyle: { color: "#8C8C8C" } };
const fmt = (v: unknown) => typeof v === "number" ? v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : String(v ?? "");

export default function ResultView({ result, onAsk }: { result: Result; onAsk?: (question: string) => void }) {
  const [view, setView] = useState(result.defaultView);
  const [chart, setChart] = useState(result.chart);
  const [restyle, setRestyle] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  const ok = result.status === "ok" || result.status === "cache_hit";
  const chartable = ok && chart.type !== "none" && result.rows.length > 0 && result.columns.includes(chart.x) && chart.y.length > 0 && chart.y.every(y => result.columns.includes(y));

  async function doRestyle(e: React.FormEvent) {
    e.preventDefault();
    if (!restyle.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/restyle", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: result.question, instruction: restyle, columns: result.columns, chart }) });
      const j = await r.json();
      if (!r.ok) return setErr(j.error ?? "Couldn't change the chart.");
      setChart(j.chart); setView("chart"); setRestyle("");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!result.runId) return;
    const title = prompt("Name this report", result.question);
    if (title === null) return;
    const r = await fetch(`/api/runs/${result.runId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ saved: true, title }) });
    setSaved(r.ok);
  }

  return (
    <div className="card">
      <div className="row">
        <span className={`badge ${result.status}`}>{result.status.replace("_", " ")}</span>
        <span className="meta">{result.model} · {result.latencyMs} ms · {result.rows.length}{result.truncated ? "+" : ""} rows</span>
        {result.runId && ok && <button className="ghost" onClick={save} disabled={saved} style={{ marginLeft: "auto" }}>{saved ? "Saved" : "Save report"}</button>}
      </div>

      {ok ? (
        <>
          <div className="tabs" role="tablist">
            {(["text", "table", "chart"] as const).map(v => (
              <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <div className="panel" key={view + chart.type}>
            {view === "text" && <p className="answer">{result.answer || "No summary (see table)."}</p>}
            {view === "table" && <DataTable columns={result.columns} rows={result.rows} />}
            {view === "chart" && (chartable ? <Chart spec={chart} rows={result.rows} /> : <p className="meta">No chart for this result. Try asking for one below.</p>)}
          </div>
          <form className="ask" onSubmit={doRestyle} style={{ marginTop: 14 }}>
            <input type="text" aria-label="Change the chart" placeholder='Change the chart, e.g. "make it a pie chart"' value={restyle} onChange={e => setRestyle(e.target.value)} />
            <button className="ghost" disabled={busy}>{busy ? "…" : "Apply"}</button>
          </form>
          {err && <p className="error" role="alert">{err}</p>}
        </>
      ) : (
        <>
          <p className="answer">{result.answer}</p>
          {onAsk && !!result.options?.length && (
            <div className="chips" role="group" aria-label="Pick what you meant">
              {result.options.map((o, i) => <button key={o} type="button" className="chip pop" style={{ "--i": i } as React.CSSProperties} onClick={() => onAsk(o)}>{o}</button>)}
            </div>
          )}
        </>
      )}

      {result.sql && (
        <details>
          <summary>SQL used</summary>
          <pre>{result.sql}</pre>
          {result.error && <p className="error">{result.error}</p>}
        </details>
      )}
    </div>
  );
}

function DataTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{columns.map(c => <td key={c} className={typeof r[c] === "number" ? "num" : ""}>{fmt(r[c])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Chart({ spec, rows }: { spec: ChartSpec; rows: Record<string, unknown>[] }) {
  const common = { data: rows, margin: { top: 10, right: 20, bottom: 10, left: 10 } };
  const axes = [
    <CartesianGrid key="g" strokeDasharray="3 3" vertical={false} />,
    <XAxis key="x" dataKey={spec.x} tick={{ fontSize: 12 }} />,
    <YAxis key="y" tickFormatter={fmt} tick={{ fontSize: 12 }} width={90} />,
    <Tooltip key="t" formatter={fmt} {...TIP} cursor={{ fill: "rgba(47,107,255,.08)" }} />,
    <Legend key="l" />,
  ];
  return (
    <figure style={{ margin: 0 }}>
      {spec.title && <figcaption className="meta" style={{ marginBottom: 8 }}>{spec.title}</figcaption>}
      <div style={{ width: "100%", height: 340 }}>
        <ResponsiveContainer>
          {spec.type === "pie" ? (
            <PieChart>
              <Pie data={rows} dataKey={spec.y[0]} nameKey={spec.x} outerRadius={120} label>
                {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={fmt} {...TIP} /><Legend />
            </PieChart>
          ) : spec.type === "line" ? (
            <LineChart {...common}>{axes}{spec.y.map((y, i) => <Line key={y} dataKey={y} stroke={COLORS[i]} strokeWidth={2} dot={false} />)}</LineChart>
          ) : spec.type === "area" ? (
            <AreaChart {...common}>{axes}{spec.y.map((y, i) => <Area key={y} dataKey={y} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.25} />)}</AreaChart>
          ) : (
            <BarChart {...common}>{axes}{spec.y.map((y, i) => <Bar key={y} dataKey={y} fill={COLORS[i]} />)}</BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
