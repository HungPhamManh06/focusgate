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

async function execMigrationSql(db: PGlite, sql: string): Promise<void> {
  try {
    await db.exec(sql);
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

async function recordMarker(
  db: PGlite,
  filename: string,
  value = "1",
): Promise<void> {
  await db.query(
    "insert into auth.local_meta (key, value) values ($1, $2) on conflict (key) do nothing",
    [markerKey(filename), value],
  );
}

/**
 * Applies FocusGate SQL migrations to a PGlite instance safely and idempotently.
 *
 * - Fresh initialization: executes every `.sql` migration in lexical order once
 *   and records a `migration:<filename>` marker in `auth.local_meta`.
 * - Existing workspace upgrade:
 *   - Never runs the unguarded historical `0006` backfill against an existing
 *     `0005` workspace; marks `0006` as `superseded_by_0007` and applies `0007`
 *     (which performs the same `DROP DEFAULT` + `NOT NULL` + `CHECK` hardening
 *     with the timestamp-guarded safe backfill).
 *   - Uses `auth.local_meta` markers for `0007+` so existing `0005`/`0006`
 *     workspaces upgrade cleanly and repeated boots are no-ops.
 *   - Failed migrations throw before recording any marker, and `0007` is
 *     idempotent so process interruption between SQL commit and marker write
 *     recovers safely on the next run.
 */
export async function applyLocalMigrations(
  db: PGlite,
  migrationsDir: string,
): Promise<{ applied: string[]; superseded: string[] }> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const schema = await db.query<{ present: boolean }>(
    "select to_regclass('public.profiles') is not null as present",
  );

  const applied: string[] = [];
  const superseded: string[] = [];

  if (!schema.rows[0]?.present) {
    for (const file of files) {
      await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
      await recordMarker(db, file);
      applied.push(file);
    }
    return { applied, superseded };
  }

  for (const file of files) {
    if (await hasMarker(db, file)) {
      continue;
    }

    if (file <= "20260101000003_backend_hardening.sql") {
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
        await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
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
        await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
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
        // An existing 0005 workspace still has DEFAULT 1. Do NOT execute the
        // unguarded 0006 backfill; instead record 0006 as superseded_by_0007
        // once 0007 runs (or mark superseded_by_0007 if 0007 is present in files).
        if (files.some((f) => f > MIGRATION_0006)) {
          await recordMarker(db, file, "superseded_by_0007");
          superseded.push(file);
          continue;
        }
      }
      await recordMarker(db, file);
      continue;
    }

    // 0007+ migrations execute reliably via `auth.local_meta` marker.
    // Marker is written ONLY after the migration SQL commits cleanly.
    await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
    await recordMarker(db, file);
    applied.push(file);
  }

  return { applied, superseded };
}
