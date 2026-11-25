"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import Orb from "./Orb";
import ResultView, { type Result } from "./ResultView";

const ACTIONS = [
  { title: "Sales Performance", cta: "Top Products Last Quarter", icon: "chart", tone: "blue", q: "Top 5 products by revenue last quarter" },
  { title: "Cash Collection", cta: "Chase Overdue Invoices", icon: "cash", tone: "violet", q: "Which customers have overdue invoices and how much does each owe?" },
  { title: "Supplier Health", cta: "Find Late Deliveries", icon: "truck", tone: "indigo", q: "On-time delivery rate by supplier for received purchase orders" },
];

const greeting = () => { const h = new Date().getHours(); return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening"; };
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function AskHome({ recent }: { recent: { id: number; question: string; at: string }[] }) {
  const [q, setQ] = useState("");
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [hello, setHello] = useState("Hello");
  const [, tick] = useState(0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setHello(greeting()); tick(1); }, []); // client-only: avoids hydration mismatch on time

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, deep }) });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? "Something went wrong.");
      else {
        setResults(rs => [j, ...rs]); setQ("");
        requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch {
      setErr("Network error — is the server running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <Orb />
        <p className="greet" data-enter="greet">{hello} 👋</p>
        <h1 id="hero-title" className="headline">
          {"WHAT DO YOU WANT TO KNOW?".split(" ").map((w, i) => <span className="mask" key={i}><span data-enter="word">{w}</span></span>)}
        </h1>
        <p className="subline" data-enter="settle">Ask your ERP anything — sales, stock, purchasing, receivables. Every answer shows the SQL behind it.</p>

        <form className="composer" data-enter="settle" onSubmit={e => { e.preventDefault(); ask(q); }}>
          <textarea ref={inputRef} rows={2} placeholder="Ask Anything..." aria-label="Your question" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(q); } }} maxLength={500} />
          <div className="composer-row">
            <div className="chips">
              <button type="button" className="chip chip-icon" aria-label="Start a new question" onClick={() => { setQ(""); inputRef.current?.focus(); }}><Icon name="plus" size={15} /></button>
              <button type="button" className={`chip${!deep ? " chip-on" : ""}`} aria-pressed={!deep} onClick={() => setDeep(false)}>Normal <Icon name="chev" size={13} /></button>
              <button type="button" className={`chip${deep ? " chip-on" : ""}`} aria-pressed={deep} onClick={() => setDeep(true)} title="Plans with more reasoning; skips the cache">
                <Icon name="spark" size={13} /> Deep Think <Icon name="chev" size={13} />
              </button>
            </div>
            <button className="send" disabled={busy || !q.trim()} aria-label={busy ? "Working" : "Send"}>
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="send" size={17} />}
            </button>
          </div>
        </form>
        {err && <p className="error" role="alert">{err}</p>}

        <div className="actions">
          {ACTIONS.map(a => (
            <button key={a.title} type="button" className="action" data-enter="settle" onClick={() => ask(a.q)} disabled={busy}>
              <span className={`action-icon tone-${a.tone}`}><Icon name={a.icon} size={17} /></span>
              <span className="action-text"><span className="action-title">{a.title}</span><span className="action-cta">{a.cta}</span></span>
            </button>
          ))}
        </div>

        <div className="history" data-enter="history">
          <h2>Recent Conversations</h2>
          {recent.length ? (
            <ul className="tree">
              {recent.map(r => (
                <li key={r.id} data-enter="history">
                  <Link href={`/explorer/${r.id}`}>{r.question}</Link>
                  <time dateTime={r.at} suppressHydrationWarning>{ago(r.at)}</time>
                </li>
              ))}
            </ul>
          ) : <p className="muted">No questions yet — try a card above.</p>}
          <Link href="/explorer" className="see-more" data-enter="history">See More <Icon name="arrow" size={14} /></Link>
        </div>
      </section>

      <div ref={resultsRef} className="results">
        {results.map((r, i) => (
          <section key={r.runId ?? i} aria-label={r.question}>
            <h2 className="result-q">{r.question}</h2>
            <ResultView result={r} />
          </section>
        ))}
      </div>
    </>
  );
}
