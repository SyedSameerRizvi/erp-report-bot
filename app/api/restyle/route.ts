import { ChartSpec, RateLimitError, restyleChart } from "@/lib/llm";
import { z } from "zod";

export const runtime = "nodejs";

const Body = z.object({ question: z.string().max(500), instruction: z.string().min(1).max(200), columns: z.array(z.string()).max(50), chart: ChartSpec });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { question, instruction, columns, chart } = parsed.data;
  try {
    const next = await restyleChart(question, instruction, columns, chart);
    // keep the model honest: it may only use columns the query actually returned
    if (next.type !== "none" && (!columns.includes(next.x) || !next.y.length || !next.y.every(y => columns.includes(y)))) {
      return Response.json({ error: "That chart needs columns this result doesn't have — try asking a new question." }, { status: 422 });
    }
    return Response.json({ chart: next });
  } catch (e) {
    if (e instanceof RateLimitError) return Response.json({ error: `Busy — try again in ${e.retryAfterSec}s.` }, { status: 429 });
    console.error(e);
    return Response.json({ error: "Couldn't change the chart." }, { status: 500 });
  }
}
