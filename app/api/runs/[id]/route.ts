import { getDb } from "@/lib/db";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id." }, { status: 400 });
  const title = typeof body.title === "string" ? body.title.slice(0, 200) : null;
  const db = await getDb();
  const rows = await db.query("UPDATE app.report_runs SET saved = $2, title = COALESCE($3, title) WHERE id = $1 RETURNING id", [id, body.saved !== false, title]);
  return rows.length ? Response.json({ ok: true }) : Response.json({ error: "Not found." }, { status: 404 });
}
