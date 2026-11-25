// One query interface over real Postgres (DATABASE_URL, e.g. Supabase) or in-process PGlite for local dev/evals.
// shortcut: PGlite is single-connection, fine for dev + evals; set DATABASE_URL for anything shared.
import type { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";

export type Row = Record<string, unknown>;
export type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;
export interface Db {
  query: Query;
  exec(sql: string): Promise<void>;
  /** Run fn inside one transaction on one connection. readOnly transactions are always rolled back. */
  tx<T>(fn: (q: Query) => Promise<T>, readOnly?: boolean): Promise<T>;
}

const g = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  return (g.__db ??= process.env.DATABASE_URL ? pgDb(process.env.DATABASE_URL) : pgliteDb(process.env.PGLITE_DIR ?? ".pglite"));
}

async function pgDb(url: string): Promise<Db> {
  const pg = (await import("pg")).default;
  const pool: Pool = new pg.Pool({ connectionString: url, max: 5 });
  return {
    async query(sql, params) { return (await pool.query(sql, params)).rows; },
    async exec(sql) { await pool.query(sql); },
    async tx(fn, readOnly) {
      const c = await pool.connect();
      try {
        await c.query(readOnly ? "BEGIN READ ONLY" : "BEGIN");
        const out = await fn(async (s, p) => (await c.query(s, p)).rows);
        await c.query(readOnly ? "ROLLBACK" : "COMMIT");
        return out;
      } catch (e) {
        await c.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

async function pgliteDb(dir: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db: PGlite = new PGlite(dir);
  await db.waitReady;
  let chain: Promise<unknown> = Promise.resolve(); // serialize: PGlite has one connection
  const serial = <T>(f: () => Promise<T>): Promise<T> => { const p = chain.then(f, f); chain = p.catch(() => {}); return p; };
  const q: Query = async (s, p) => (await db.query<Row>(s, p)).rows;
  return {
    query: (s, p) => serial(() => q(s, p)),
    exec: (s) => serial(async () => { await db.exec(s); }),
    tx: (fn, readOnly) => serial(async () => {
      await db.exec(readOnly ? "BEGIN READ ONLY" : "BEGIN");
      try {
        const out = await fn(q);
        await db.exec(readOnly ? "ROLLBACK" : "COMMIT");
        return out;
      } catch (e) {
        await db.exec("ROLLBACK").catch(() => {});
        throw e;
      }
    }),
  };
}
