"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import Icon from "./Icon";

const RAIL = [
  [{ href: "/", icon: "chat", label: "Ask" }, { href: "/explorer", icon: "table", label: "Report Explorer" }],
  [{ href: "/explorer?saved=1", icon: "star", label: "Saved reports" }, { href: "/explorer?status=failed", icon: "flask", label: "Failed runs" }],
];

export default function Shell({ children, runsToday, modelLabel, live }: { children: ReactNode; runsToday: number; modelLabel: string; live: boolean }) {
  const path = usePathname();
  const router = useRouter();
  const onExplorer = path.startsWith("/explorer");
  useEntrance();

  return (
    <div className="shell">
      <aside className="rail" aria-label="Main">
        <Link href="/" className="tile tile-logo" data-enter="rail" aria-label="ERP Report Bot home"><Icon name="logo" size={18} /></Link>
        {RAIL.map((group, i) => (
          <div className="rail-group" key={i}>
            {group.map(it => {
              const active = it.href === "/" ? path === "/" : it.href === "/explorer" ? onExplorer && !it.href.includes("?") : false;
              return (
                <Link key={it.href} href={it.href} className={`tile${active ? " is-active" : ""}`} data-enter="rail" aria-label={it.label} title={it.label} aria-current={active ? "page" : undefined}>
                  <Icon name={it.icon} />
                </Link>
              );
            })}
          </div>
        ))}
        <div className="rail-bottom">
          <span className="tile" data-enter="rail" title="Settings (coming soon)"><Icon name="gear" label="Settings" /></span>
        </div>
      </aside>

      <div className="stage">
        <div className="glow" aria-hidden="true" />
        <header className="topbar">
          <div className="crumbs">
            <button className="tile" data-enter="top" onClick={() => router.back()} aria-label="Back"><Icon name="back" /></button>
            <button className="tile-flat" data-enter="top" onClick={() => router.forward()} aria-label="Forward"><Icon name="fwd" /></button>
            <nav aria-label="Breadcrumb" data-enter="top"><Link href="/">Home</Link><span aria-hidden="true">›</span><span aria-current="page">{onExplorer ? "Report Explorer" : "Report Bot"}</span></nav>
          </div>
          <div className="top-right">
            <form className="search glass" action="/explorer" role="search" data-enter="top">
              <Icon name="search" size={16} />
              <input type="search" name="q" placeholder="Search reports..." aria-label="Search past reports" />
            </form>
            <span className="tile" data-enter="top" title="No new alerts"><Icon name="bell" label="Notifications" /></span>
          </div>
        </header>

        <div className="subbar">
          <div className="seg" role="tablist" aria-label="Mode" data-enter="top">
            <Link href="/" role="tab" aria-selected={!onExplorer} className={!onExplorer ? "on" : ""}>Chat Mode</Link>
            <Link href="/explorer" role="tab" aria-selected={onExplorer} className={onExplorer ? "on" : ""}>Overview</Link>
          </div>
          <div className="status glass" data-enter="top" title={modelLabel}>
            <span className={`dot${live ? "" : " dot-mock"}`} aria-hidden="true" />
            <span>{live ? "Report Bot Live" : "Mock Mode"}</span>
            <span className="badge-count" aria-label={`${runsToday} reports in the last 24 hours`}>{runsToday}</span>
          </div>
        </div>

        <div className="content">{children}</div>
      </div>
    </div>
  );
}

/** One Web Animations timeline for the whole entrance, ordered by group. Skipped for reduced motion. */
function useEntrance() {
  useEffect(() => {
    if (sessionStorage.getItem("entered") || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("entered");
      return;
    }
    sessionStorage.setItem("entered", "1");
    const ease = "cubic-bezier(.2,.8,.2,1)";
    const steps: [string, Keyframe[], number, number][] = [ // selector, frames, start ms, stagger ms
      ['[data-enter="rail"]', [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 0, 35],
      ['[data-enter="top"]', [{ opacity: 0, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], 120, 40],
      ['[data-enter="orb"]', [{ opacity: 0, clipPath: "circle(0% at 50% 50%)", transform: "scale(.92)" }, { opacity: 1, clipPath: "circle(75% at 50% 50%)", transform: "scale(1)" }], 380, 0],
      ['[data-enter="greet"]', [{ opacity: 0 }, { opacity: 1 }], 780, 0],
      ['[data-enter="word"]', [{ transform: "translateY(110%)" }, { transform: "none" }], 880, 70],
      ['[data-enter="settle"]', [{ opacity: 0, transform: "translateY(14px)" }, { opacity: 1, transform: "none" }], 1150, 90],
      ['[data-enter="history"]', [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], 1550, 60],
    ];
    for (const [sel, frames, start, stagger] of steps) {
      document.querySelectorAll<HTMLElement>(sel).forEach((el, i) =>
        el.animate(frames, { duration: sel.includes("orb") ? 900 : 560, delay: start + i * stagger, easing: ease, fill: "backwards" }));
    }
    document.documentElement.classList.add("entered");
  }, []);
}
