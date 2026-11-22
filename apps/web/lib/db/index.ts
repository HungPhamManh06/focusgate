import "server-only";

import { PGlite } from "@electric-sql/pglite";
import { access, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { applyLocalMigrations } from "./migrations";

/**
 * Local development data layer.
 *
 * It runs the *real* migrations in an embedded PostgreSQL (PGlite), so RLS,
 * constraints, triggers and the reward RPCs are exercised exactly as they are
 * in Supabase. The app talks to this module only on the server.
 *
 * Production replaces this module with Supabase (anon key + user session); the
 * SQL contracts are identical. See docs/WEB.md.
 */
export const LOCAL_USER_ID = "9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
export const LOCAL_USER_EMAIL = "alex@focusgate.local";

type Holder = { dbPromise: Promise<PGlite> };

const globalForDb = globalThis as unknown as {
  __focusgateDb?: Holder;
  __focusgateQueue?: Promise<unknown>;
};

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function candidateRoots(): string[] {
  return [process.cwd(), path.resolve(process.cwd(), ".."), path.resolve(process.cwd(), "../..")];
}

async function resolveLocalFile(name: string): Promise<string> {
  for (const root of candidateRoots()) {
    const direct = path.join(root, "lib", "db", "local", name);
    if (await exists(direct)) return direct;
    const nested = path.join(root, "apps", "web", "lib", "db", "local", name);
    if (await exists(nested)) return nested;
  }
  throw new Error(`Could not locate ${name}. Run the web app from apps/web.`);
}

async function resolveMigrationsDir(): Promise<string> {
  const envDir = process.env.FOCUSGATE_MIGRATIONS_DIR;
  const candidates = [
    ...(envDir ? [envDir] : []),
    path.resolve(process.cwd(), "../../supabase/migrations"),
    path.resolve(process.cwd(), "../supabase/migrations"),
    path.resolve(process.cwd(), "supabase/migrations"),
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  throw new Error("Could not locate supabase/migrations.");
}

async function createDatabase(): Promise<PGlite> {
  const dataDir =
    process.env.FOCUSGATE_DATA_DIR ?? path.join(process.cwd(), ".data", "postgres");
  await mkdir(dataDir, { recursive: true });

  const db = new PGlite(dataDir);
  await db.query("select 1");

  await db.exec(await readFile(await resolveLocalFile("bootstrap.sql"), "utf8"));

  const migrationsDir = await resolveMigrationsDir();
  const { applied } = await applyLocalMigrations(db, migrationsDir);
  if (applied.length > 0) {
    console.info(`[focusgate/db] applied ${applied.length} migration(s): ${applied.join(", ")}`);
  }

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, $2, $3::jsonb)
     on conflict (id) do nothing`,
    [LOCAL_USER_ID, LOCAL_USER_EMAIL, JSON.stringify({ display_name: "Alex Morgan" })],
  );

  const seeded = await db.query<{ seeded: boolean }>(
    "select exists(select 1 from auth.local_meta where key = 'seeded') as seeded",
  );
  if (!seeded.rows[0]?.seeded) {
    await db.exec(await readFile(await resolveLocalFile("seed.sql"), "utf8"));
    await db.query(
      "insert into auth.local_meta (key, value) values ('seeded', '1') on conflict (key) do nothing",
    );
    console.info("[focusgate/db] local workspace seeded");
  }

  return db;
}

function dbReady(): Promise<PGlite> {
  const existing = globalForDb.__focusgateDb;
  if (existing) return existing.dbPromise;

  const holder: Holder = { dbPromise: createDatabase() };
  globalForDb.__focusgateDb = holder;

  holder.dbPromise.catch(() => {
    // Allow a later request to retry a failed initialization (e.g. file lock).
    if (globalForDb.__focusgateDb === holder) globalForDb.__focusgateDb = undefined;
  });

  return holder.dbPromise;
}

/** Serializes all work on the single PGlite connection. */
function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const previous = globalForDb.__focusgateQueue ?? Promise.resolve();
  const run = previous.then(work, work);
  globalForDb.__focusgateQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Executes a callback inside a transaction as the `authenticated` role with
 * auth.uid() set to the local workspace user. RLS and SECURITY DEFINER rules
 * therefore behave exactly as they do behind PostgREST.
 */
export function withUser<T>(callback: (db: PGlite) => Promise<T>): Promise<T> {
  return enqueue(async () => {
    const db = await dbReady();
    await db.exec("begin");
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [LOCAL_USER_ID]);
      await db.exec("set local role authenticated");
      const result = await callback(db);
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback").catch(() => undefined);
      throw error;
    }
  });
}

export type Db = PGlite;
