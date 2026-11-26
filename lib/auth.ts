// Supabase Auth (email + password). Off when the Supabase env vars are unset, so local dev and evals need no project.
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const authEnabled = () => Boolean(SUPABASE_URL && SUPABASE_KEY);

export function assertAuthConfigured() {
  // never ship an open bot by accident: production without Supabase keys refuses to serve
  if (!authEnabled() && process.env.NODE_ENV === "production") throw new Error("Supabase auth is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).");
}

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: list => { try { list.forEach(c => store.set(c.name, c.value, c.options)); } catch { /* read-only in Server Components; proxy refreshes */ } },
    },
  });
}

export type User = { id: string; email: string | null };
export const LOCAL_USER: User = { id: "local", email: null };

// Authoritative check (asks Supabase), used by every API route and page that reads data.
export async function currentUser(): Promise<User | null> {
  assertAuthConfigured();
  if (!authEnabled()) return LOCAL_USER;
  const { data } = await (await supabaseServer()).auth.getUser();
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
}

// Pages: same check; signed-out users go to /login (the proxy usually catches them first).
export async function requirePageUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}
