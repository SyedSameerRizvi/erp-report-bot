import { NextResponse } from "next/server";
import { authEnabled, supabaseServer } from "@/lib/auth";

export async function POST(req: Request) {
  if (authEnabled()) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
