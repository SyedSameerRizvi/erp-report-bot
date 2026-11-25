"use client";
import { useState } from "react";
import ResultView, { type Result } from "./ResultView";

export default function Rerun({ question }: { question: string }) {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, bypassCache: true }) });
      const j = await r.json();
      if (r.ok) setRes(j); else setErr(j.error ?? "Re-run failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button className="btn btn-primary" onClick={run} disabled={busy}>{busy ? "Running…" : "Re-run on current data"}</button>
      {err && <p className="error" role="alert">{err}</p>}
      {res && <div style={{ marginTop: 16 }}><ResultView result={res} /></div>}
    </>
  );
}
