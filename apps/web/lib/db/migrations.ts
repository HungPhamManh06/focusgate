import type { PGlite } from "@electric-sql/pglite";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const MIGRATION_0003 = "20260101000003_backend_hardening.sql";
const MIGRATION_0004 = "20260101000004_focus_session_integrity.sql";
const MIGRATION_0005 = "20260101000005_focus_validity_snapshot.sql";
const MIGRATION_0006 = "20260101000006_legacy_snapshot_and_insert_hardening.sql";
const MIGRATION_0007 = "20260101000007_focus_snapshot_backfill_safety.sql";

function markerKey(filename: string): string {
  return `migration:${filename}`;
}

async function getMarkerValue(db: PGlite, filename: string): Promise<string | null> {
  const res = await db.query<{ value: string }>(
    "select value from auth.local_meta where key = $1",
    [markerKey(filename)],
  );
  return res.rows[0]?.value ?? null;
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
    "insert into auth.local_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
    [markerKey(filename), value],
  );
}

/**
 * Applies FocusGate SQL migrations to a local PGlite workspace safely and idempotently.
 *
 * NOTE: This runner applies ONLY to local embedded PGlite workspaces (`.data/postgres`).
 * Hosted Supabase deployments use `supabase_migrations.schema_migrations` and follow the
 * procedure in `docs/SUPABASE_MIGRATION_RUNBOOK.md`.
 *
 * Safety invariants:
 * - Fresh workspace: executes every `.sql` migration in lexical order once.
 * - Existing `0005` workspace: does NOT execute the unguarded `0006` backfill.
 *   Instead it verifies `0007` is present, executes `0007` first, and ONLY after
 *   `0007` completes successfully marks `0006` as `superseded_by_0007` and `0007` as `1`.
 * - Existing `0006` workspace: records `0006` as `1` (already applied) and runs `0007+`.
 * - Existing `0007+` workspace: validates schema consistency (throws an actionable error
 *   if `0007` is marked applied while `min_valid_minutes` still has `DEFAULT 1`), and
 *   applies only unapplied forward migrations (`0008+`).
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

  // Consistency check: if 0007 is already marked applied, min_valid_minutes must exist
  // and must NOT still have DEFAULT 1.
  const marker0007 = await getMarkerValue(db, MIGRATION_0007);
  if (marker0007 !== null) {
    const colCheck = await db.query<{ exists: boolean; has_default: boolean }>(
      `select
         count(*) > 0 as exists,
         coalesce(bool_or(column_default is not null), false) as has_default
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'focus_sessions'
         and column_name = 'min_valid_minutes'`,
    );
    if (!colCheck.rows[0]?.exists || colCheck.rows[0]?.has_default) {
      throw new Error(
        `Inconsistent local migration state: ${MIGRATION_0007} is marked applied, ` +
          `but focus_sessions.min_valid_minutes is missing or still has a column default.`,
      );
    }
  }

  let deferredSupersede0006 = false;

  for (const file of files) {
    const existingMarker = await getMarkerValue(db, file);
    if (existingMarker !== null) {
      continue;
    }

    if (file <= MIGRATION_0003) {
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
        // Existing 0005 workspace: never run the unguarded 0006 backfill.
        // Verify 0007 is explicitly available, and defer marking 0006 as
        // `superseded_by_0007` until AFTER 0007 executes and succeeds.
        if (!files.includes(MIGRATION_0007)) {
          throw new Error(
            `Cannot safely upgrade 0005 workspace past ${MIGRATION_0006}: ` +
              `required safety migration ${MIGRATION_0007} is missing from ${migrationsDir}.`,
          );
        }
        deferredSupersede0006 = true;
        continue;
      }

      // 0006 was already applied directly (column_default is NULL).
      await recordMarker(db, file, "1");
      continue;
    }

    await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
    await recordMarker(db, file);
    applied.push(file);

    if (file === MIGRATION_0007 && deferredSupersede0006) {
      await recordMarker(db, MIGRATION_0006, "superseded_by_0007");
      superseded.push(MIGRATION_0006);
      deferredSupersede0006 = false;
    }
  }

  if (deferredSupersede0006) {
    // Handles recovery if 0007 was already marked applied while 0006 marker was absent.
    const marker7Now = await getMarkerValue(db, MIGRATION_0007);
    if (marker7Now !== null) {
      await recordMarker(db, MIGRATION_0006, "superseded_by_0007");
      superseded.push(MIGRATION_0006);
    } else {
      throw new Error(
        `Incomplete upgrade: ${MIGRATION_0006} was deferred, but ${MIGRATION_0007} did not complete.`,
      );
    }
  }

  return { applied, superseded };
}
