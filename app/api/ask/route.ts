import { ask } from "@/lib/pipeline";
import { RateLimitError } from "@/lib/llm";
import { getDb } from "@/lib/db";
import { HOURLY_QUOTA, overQuota } from "@/lib/guardrails";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question || question.length > 500) return Response.json({ error: "Ask a question (max 500 characters)." }, { status: 400 });
  if (await overQuota(await getDb())) return Response.json({ error: `The app has hit its limit of ${HOURLY_QUOTA} new questions an hour. Cached answers still work; try again later.` }, { status: 429 });
  try {
    return Response.json(await ask(question, { bypassCache: body.bypassCache === true, deep: body.deep === true }));
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: `Busy — try again in ${e.retryAfterSec}s.`, retryAfter: e.retryAfterSec }, { status: 429 });
    console.error(e);
    return Response.json({ error: "Something went wrong answering that." }, { status: 500 });
  }
}
