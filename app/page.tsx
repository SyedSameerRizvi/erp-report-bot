import { getDb } from "@/lib/db";
import AskHome from "@/components/AskHome";

export const dynamic = "force-dynamic";

export default async function Page() {
  const db = await getDb();
  const recent = await db.query(
    "SELECT id, question, created_at FROM app.report_runs WHERE status <> 'cache_hit' ORDER BY created_at DESC LIMIT 4").catch(() => []);
  return <AskHome recent={recent.map(r => ({ id: Number(r.id), question: String(r.question), at: new Date(r.created_at as string).toISOString() }))} />;
}
