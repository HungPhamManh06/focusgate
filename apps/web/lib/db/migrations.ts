import type { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_0004 = "20260101000004_focus_session_integrity.sql";
const MIGRATION_0005 = "20260101000005_focus_validity_snapshot.sql";
const MIGRATION_0006 = "20260101000006_legacy_snapshot_and_insert_hardening.sql";

function markerKey(filename: string): string {
  return `migration:${filename}`;
}

async function hasMarker(db: PGlite, filename: string): Promise<boolean> {
  const res = await db.query<{ present: boolean }>(
    "select exists(select 1 from auth.local_meta where key = $1) as present",
    [markerKey(filename)],
  );
  return Boolean(res.rows[0]?.present);
}

async function recordMarker(db: PGlite, filename: string): Promise<void> {
  await db.query(
    "insert into auth.local_meta (key, value) values ($1, '1') on conflict (key) do nothing",
    [markerKey(filename)],
  );
}

/**
 * Applies FocusGate SQL migrations to a PGlite instance safely and idempotently.
 *
 * - Fresh initialization: executes every `.sql` migration in lexical order once
 *   and records a `migration:<filename>` marker in `auth.local_meta`.
 * - Existing workspace upgrade: applies any unapplied migrations (`0004`–`0006`
 *   via legacy schema detection if not yet marked, and `0007+` strictly via
 *   `auth.local_meta` markers) without deleting data or re-running applied scripts.
 */
export async function applyLocalMigrations(
  db: PGlite,
  migrationsDir: string,
): Promise<{ applied: string[] }> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const schema = await db.query<{ present: boolean }>(
    "select to_regclass('public.profiles') is not null as present",
  );

  const applied: string[] = [];

  if (!schema.rows[0]?.present) {
    for (const file of files) {
      await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
      await recordMarker(db, file);
      applied.push(file);
    }
    return { applied };
  }

  // Existing workspace: inspect legacy schema state for 0004..0006 if markers are
  // absent, then use `auth.local_meta` markers for 0007+ and all future runs.
  for (const file of files) {
    if (await hasMarker(db, file)) {
      continue;
    }

    if (file <= "20260101000003_backend_hardening.sql") {
      // Base 0001..0003 already present because `public.profiles` exists.
      await recordMarker(db, file);
      continue;
    }

    if (file === MIGRATION_0004) {
      const hasCredited = await db.query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = 'focus_sessions'
             and column_name = 'credited_minutes'
         ) as present`,
      );
      if (!hasCredited.rows[0]?.present) {
        await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
        applied.push(file);
      }
      await recordMarker(db, file);
      continue;
    }

    if (file === MIGRATION_0005) {
      const hasMinValidSnapshot = await db.query<{ present: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public'
             and table_name = 'focus_sessions'
             and column_name = 'min_valid_minutes'
         ) as present`,
      );
      if (!hasMinValidSnapshot.rows[0]?.present) {
        await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
        applied.push(file);
      }
      await recordMarker(db, file);
      continue;
    }

    if (file === MIGRATION_0006) {
      const hasMinValidDefault = await db.query<{ has_default: boolean }>(
        `select column_default is not null as has_default
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'focus_sessions'
           and column_name = 'min_valid_minutes'`,
      );
      if (hasMinValidDefault.rows[0]?.has_default) {
        await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
        applied.push(file);
      }
      await recordMarker(db, file);
      continue;
    }

    // 0007+ migrations are tracked strictly by `auth.local_meta` marker so they
    // execute reliably on every existing workspace regardless of prior schema state.
    await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
    await recordMarker(db, file);
    applied.push(file);
  }

  return { applied };
}
