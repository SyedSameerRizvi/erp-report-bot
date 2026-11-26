import "./globals.css";
import { Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import { getDb } from "@/lib/db";
import { BIG_MODEL, isMock } from "@/lib/llm";

const font = Inter_Tight({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata = { title: "ERP Report Bot", description: "Ask your ERP data questions in plain English." };
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const db = await getDb();
  const [s] = await db.query("SELECT count(*) AS n FROM app.report_runs WHERE created_at > now() - interval '24 hours'").catch(() => [{ n: 0 }]);
  const live = !isMock();
  return (
    <html lang="en" className={font.className}>
      <body>
        <Shell runsToday={Number(s.n)} live={live} modelLabel={live ? `Groq · ${BIG_MODEL}` : "Mock mode: add GROQ_API_KEY for real answers"}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
