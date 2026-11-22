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

function pendingSupersedeKey(filename: string): string {
  return `pending_supersede:${filename}`;
}

async function getMetaValue(db: PGlite, key: string): Promise<string | null> {
  const res = await db.query<{ value: string }>(
    "select value from auth.local_meta where key = $1",
    [key],
  );
  return res.rows[0]?.value ?? null;
}

async function setMetaValue(db: PGlite, key: string, value: string): Promise<void> {
  await db.query(
    "insert into auth.local_meta (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value",
    [key, value],
  );
}

async function deleteMetaValue(db: PGlite, key: string): Promise<void> {
  await db.query("delete from auth.local_meta where key = $1", [key]);
}

async function getMarkerValue(db: PGlite, filename: string): Promise<string | null> {
  return getMetaValue(db, markerKey(filename));
}

async function recordMarker(
  db: PGlite,
  filename: string,
  value = "1",
): Promise<void> {
  await setMetaValue(db, markerKey(filename), value);
}

async function execMigrationSql(db: PGlite, sql: string): Promise<void> {
  try {
    await db.exec(sql);
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

/**
 * Applies FocusGate SQL migrations to a local PGlite workspace safely and idempotently.
 *
 * NOTE: This runner applies ONLY to local embedded PGlite workspaces (`.data/postgres`).
 * Hosted Supabase deployments use `supabase_migrations.schema_migrations` and follow the
 * procedure in `docs/SUPABASE_MIGRATION_RUNBOOK.md`.
 *
 * Recovery & supersession invariants:
 * - Fresh workspace: executes every `.sql` migration in lexical order once.
 * - Existing `0005` workspace:
 *   1. Records durable `pending_supersede:<0006>` = `superseded_by_0007` BEFORE running `0007`.
 *   2. Executes `0007` and records `migration:<0007> = '1'`.
 *   3. Only AFTER `0007` succeeds, records `migration:<0006> = 'superseded_by_0007'` and
 *      clears `pending_supersede:<0006>`.
 *   4. If the process stops between (2) and (3), the next run sees `pending_supersede:<0006>`
 *      and `migration:<0007> = '1'`, recovering `migration:<0006> = 'superseded_by_0007'`
 *      without misclassifying `0006` as `'1'` or re-running `0007`.
 *   5. If `0007` fails, `0006` is never marked applied or superseded, and `pending_supersede:<0006>`
 *      remains in `auth.local_meta` for safe retry.
 */
export async function applyLocalMigrations(
  db: PGlite,
  migrationsDir: string,
): Promise<{ applied: string[]; superseded: string[]; recovered: string[] }> {
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const schema = await db.query<{ present: boolean }>(
    "select to_regclass('public.profiles') is not null as present",
  );

  const applied: string[] = [];
  const superseded: string[] = [];
  const recovered: string[] = [];

  if (!schema.rows[0]?.present) {
    for (const file of files) {
      await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
      await recordMarker(db, file);
      applied.push(file);
    }
    return { applied, superseded, recovered };
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

  // Recover any interrupted 0005 -> 0007 upgrade where 0007 already completed and
  // recorded its marker, but the process stopped before recording 0006 as superseded.
  const pendingSupersede0006 = await getMetaValue(db, pendingSupersedeKey(MIGRATION_0006));
  const existing0006Marker = await getMarkerValue(db, MIGRATION_0006);
  if (pendingSupersede0006 !== null && marker0007 !== null && existing0006Marker === null) {
    await recordMarker(db, MIGRATION_0006, "superseded_by_0007");
    await deleteMetaValue(db, pendingSupersedeKey(MIGRATION_0006));
    superseded.push(MIGRATION_0006);
    recovered.push(MIGRATION_0006);
  }

  let deferredSupersede0006 = pendingSupersede0006 !== null && marker0007 === null;

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
      // If a durable pending-supersession intent already exists (e.g. retrying after a failed 0007),
      // keep deferring 0006 without executing it or marking it `'1'`.
      if (deferredSupersede0006) {
        if (!files.includes(MIGRATION_0007)) {
          throw new Error(
            `Cannot resume superseding ${MIGRATION_0006}: required safety migration ${MIGRATION_0007} is missing.`,
          );
        }
        continue;
      }

      const hasMinValidDefault = await db.query<{ has_default: boolean }>(
        `select column_default is not null as has_default
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'focus_sessions'
           and column_name = 'min_valid_minutes'`,
      );

      if (hasMinValidDefault.rows[0]?.has_default) {
        // Existing 0005 workspace: record durable pending-supersession intent BEFORE running 0007,
        // and do NOT mark 0006 as `superseded_by_0007` until 0007 finishes.
        if (!files.includes(MIGRATION_0007)) {
          throw new Error(
            `Cannot safely upgrade 0005 workspace past ${MIGRATION_0006}: ` +
              `required safety migration ${MIGRATION_0007} is missing from ${migrationsDir}.`,
          );
        }
        await setMetaValue(db, pendingSupersedeKey(MIGRATION_0006), "superseded_by_0007");
        deferredSupersede0006 = true;
        continue;
      }

      // Genuinely executed 0006 database (no pending_supersede intent and column_default is NULL).
      await recordMarker(db, file, "1");
      continue;
    }

    await execMigrationSql(db, await readFile(path.join(migrationsDir, file), "utf8"));
    await recordMarker(db, file);
    applied.push(file);

    if (file === MIGRATION_0007 && deferredSupersede0006) {
      await recordMarker(db, MIGRATION_0006, "superseded_by_0007");
      await deleteMetaValue(db, pendingSupersedeKey(MIGRATION_0006));
      superseded.push(MIGRATION_0006);
      deferredSupersede0006 = false;
    }
  }

  return { applied, superseded, recovered };
}
