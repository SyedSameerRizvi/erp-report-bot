"use client";
import Link from "next/link";
import { createBrowserClient } from "@supabase/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export default function LoginPage() {
  return <Suspense><Login /></Suspense>;
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get("next") ?? "/";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/"; // no open redirects
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState(params.get("error") ? "That confirmation link didn't work. Try signing in, or sign up again." : "");
  const [busy, setBusy] = useState(false);

  if (!URL_ || !KEY) return (
    <div className="page login"><div className="card"><h1>Login is off</h1>
      <p className="sub">The app is running as a local demo user, so there is nothing to sign in to yet. To turn on email sign-in:</p>
      <ol className="sub"><li>Create a free project at supabase.com.</li><li>Copy its Project URL and publishable key (Project Settings → API).</li>
        <li>Put them in <code>.env.local</code> as <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code>, then restart the app.</li></ol>
      <Link href="/" className="btn">Back to the app</Link></div></div>
  );

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email")), password = String(f.get("password"));
    setBusy(true); setMsg("");
    const auth = createBrowserClient(URL_, KEY).auth;
    const { data, error } = mode === "in"
      ? await auth.signInWithPassword({ email, password })
      : await auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` } });
    setBusy(false);
    if (error) return setMsg(error.message);
    if (!data.session) return setMsg("Check your email for a confirmation link, then sign in.");
    router.replace(next);
    router.refresh();
  }

  return (
    <div className="page login">
      <form className="card" onSubmit={submit}>
        <h1>{mode === "in" ? "Sign in" : "Create an account"}</h1>
        <p className="sub">ERP Report Bot answers questions about your company&apos;s sales, customers, stock, suppliers and receivables.</p>
        <label>Email<input type="email" name="email" required autoComplete="email" /></label>
        <label>Password<input type="password" name="password" required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
        {msg && <p className="meta" role="status">{msg}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}</button>
        <button type="button" className="linkish" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(""); }}>
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
