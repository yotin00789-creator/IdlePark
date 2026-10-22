// Database access. DATABASE_URL set  -> node-postgres (Neon / Vercel Postgres / any Postgres).
// DATABASE_URL missing -> embedded PGlite (file in .data/, or memory) for local use and tests.
import { migrations } from "./migrations.js";

export type Row = Record<string, any>;
export interface Queryable {
  query<T = Row>(sql: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Queryable {
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

async function connectPg(url: string): Promise<Db> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    options: "-c timezone=Asia/Bangkok",
  });
  const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: Row[] }> }): Queryable => ({
    async query(sql, params) {
      return (await c.query(sql, params as unknown[])).rows as any;
    },
  });
  return {
    ...wrap(pool),
    async tx(fn) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const out = await fn(wrap(client));
        await client.query("commit");
        return out;
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function connectPglite(dir: string | undefined): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dir) {
    const { mkdirSync } = await import("node:fs");
    const { dirname } = await import("node:path");
    mkdirSync(dirname(dir), { recursive: true });
  }
  const db = new PGlite(dir);
  await db.waitReady;
  await db.exec("set time zone 'Asia/Bangkok'");
  const wrap = (c: { query: (s: string, p?: unknown[]) => Promise<{ rows: any[] }> }): Queryable => ({
    async query(sql, params) {
      return (await c.query(sql, params as unknown[])).rows;
    },
  });
  return {
    ...wrap(db),
    tx: (fn) => db.transaction((t) => fn(wrap(t as any))),
    close: () => db.close(),
  };
}

export async function migrate(db: Db) {
  await db.query(
    "create table if not exists schema_migrations (id integer primary key, name text not null, applied_at timestamptz not null default now())",
  );
  const done = new Set(
    (await db.query<{ id: number }>("select id from schema_migrations")).map((r) => r.id),
  );
  for (const m of migrations) {
    if (done.has(m.id)) continue;
    await db.tx(async (q) => {
      for (const stmt of splitSql(m.sql)) await q.query(stmt);
      await q.query("insert into schema_migrations (id, name) values ($1, $2)", [m.id, m.name]);
    });
  }
}

// Migrations contain no $$ bodies or string literals with semicolons.
const splitSql = (sql: string) =>
  sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

// Kept on globalThis so dev-server reloads reuse one connection (PGlite allows a single opener).
const g = globalThis as unknown as { __parkingDb?: Promise<Db> | null; __parkingMigrated?: number };

/** Shared connection for the process (serverless instances reuse it). */
export function getDb(): Promise<Db> {
  if (!g.__parkingDb) {
    g.__parkingDb = (async () => {
      const url = process.env.DATABASE_URL;
      // A serverless host has no disk that lasts: without a real database every save would silently vanish.
      if (!url && (process.env.VERCEL || (process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "1"))) {
        g.__parkingDb = null;
        throw new Error("ยังไม่ได้ตั้งค่า DATABASE_URL (ฐานข้อมูล PostgreSQL) ข้อมูลจะไม่ถูกเก็บถาวร ดู README หัวข้อ Deploy");
      }
      const db = url
        ? await connectPg(url)
        : await connectPglite(
            process.env.PGLITE_MEMORY === "1" ? undefined : (process.env.PGLITE_DIR ?? ".data/pglite"),
          );
      await migrate(db);
      g.__parkingMigrated = migrations.length;
      return db;
    })();
  } else if (g.__parkingMigrated !== migrations.length) {
    // a dev server that stayed running while new migrations were added: apply them to the open connection
    const open = g.__parkingDb;
    g.__parkingDb = open.then(async (db) => {
      await migrate(db);
      g.__parkingMigrated = migrations.length;
      return db;
    });
  }
  return g.__parkingDb;
}

/** Fresh isolated in-memory database, for tests. */
export async function createTestDb(): Promise<Db> {
  const db = await connectPglite(undefined);
  await migrate(db);
  return db;
}

export function resetDbCache() {
  g.__parkingDb = null;
}

/** What the running process stores data in, so the admin can see that saves are really kept. */
export function dbInfo() {
  const url = process.env.DATABASE_URL;
  if (url) {
    let host = "";
    try {
      host = new URL(url).host;
    } catch {
      /* ignore */
    }
    return { kind: "postgres" as const, durable: true, location: host, note: "PostgreSQL" };
  }
  if (process.env.PGLITE_MEMORY === "1") return { kind: "memory" as const, durable: false, location: "หน่วยความจำ", note: "ข้อมูลหายเมื่อปิดโปรแกรม (ใช้เฉพาะตอนทดสอบ)" };
  const dir = process.env.PGLITE_DIR ?? ".data/pglite";
  return { kind: "pglite" as const, durable: true, location: dir, note: "ไฟล์ในเครื่อง (PGlite) เก็บถาวรในโฟลเดอร์นี้" };
}

// PGlite keeps recent changes in its write-ahead log until a checkpoint. Flush it periodically and on exit so the
// data files on disk are complete even if the process is stopped abruptly.
if (!process.env.DATABASE_URL && process.env.PGLITE_MEMORY !== "1" && !process.env.VERCEL && !process.env.VITEST && process.env.NODE_ENV !== "test") {
  const flag = globalThis as unknown as { __parkingCheckpoint?: boolean };
  if (!flag.__parkingCheckpoint) {
    flag.__parkingCheckpoint = true;
    const checkpoint = async () => {
      try {
        if (g.__parkingDb) await (await g.__parkingDb).query("checkpoint");
      } catch {
        /* the next tick tries again */
      }
    };
    setInterval(() => void checkpoint(), 60_000).unref?.();
    for (const sig of ["SIGINT", "SIGTERM"] as const) {
      process.once(sig, () => {
        void (async () => {
          try {
            if (g.__parkingDb) await (await g.__parkingDb).close();
          } catch {
            /* ignore */
          }
          process.exit(0);
        })();
      });
    }
  }
}
