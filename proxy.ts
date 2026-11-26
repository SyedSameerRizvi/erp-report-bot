// Refreshes the Supabase session cookie on every request and sends signed-out users to /login.
// Optimistic only: API routes re-check the user with currentUser().
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
const PUBLIC = ["/login", "/auth/"];

export async function proxy(req: NextRequest) {
  if (!URL_ || !KEY) return NextResponse.next(); // auth off (local dev); production is blocked in lib/auth.ts
  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(URL_, KEY, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: list => {
        list.forEach(c => req.cookies.set(c.name, c.value));
        res = NextResponse.next({ request: req });
        list.forEach(c => res.cookies.set(c.name, c.value, c.options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const path = req.nextUrl.pathname;
  if (!data?.claims && !PUBLIC.some(p => path.startsWith(p))) {
    if (path.startsWith("/api/")) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    const to = new URL("/login", req.url);
    to.searchParams.set("next", path + req.nextUrl.search);
    return NextResponse.redirect(to);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|webp|mp4)$).*)"] };
