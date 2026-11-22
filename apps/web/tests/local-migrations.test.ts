import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyLocalMigrations } from "../lib/db/migrations.ts";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
const BOOTSTRAP_SQL = path.join(process.cwd(), "lib", "db", "local", "bootstrap.sql");
const SEED_SQL = path.join(process.cwd(), "lib", "db", "local", "seed.sql");
const SEED_USER = "9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const SEED_DEVICE = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

async function createBootstrappedDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(await readFile(BOOTSTRAP_SQL, "utf8"));
  return db;
}

async function setUserSettingsHistory(
  db: PGlite,
  userId: string,
  minValid: number,
  updatedAtExpr: string,
): Promise<void> {
  await db.exec("alter table public.user_settings disable trigger trg_user_settings_touch");
  try {
    await db.query(
      `update public.user_settings
       set min_valid_focus_minutes = $2,
           updated_at = ${updatedAtExpr}
       where user_id = $1`,
      [userId, minValid],
    );
  } finally {
    await db.exec("alter table public.user_settings enable trigger trg_user_settings_touch");
  }
}

test("Local migrations: fresh initialization runs 0001..0007 once and repeated runs are no-ops", async () => {
  const db = await createBootstrappedDb();

  const first = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.equal(first.applied.length, 7);
  assert.deepEqual(first.superseded, []);
  assert.ok(first.applied.includes("20260101000007_focus_snapshot_backfill_safety.sql"));

  const second = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.superseded, []);

  await db.close();
});

test("Local migrations: 0005 upgrade supersedes unsafe 0006, applies 0007, protects legit snapshots, and repairs safe legacy ones", async () => {
  const db = await createBootstrappedDb();

  const pre0006 = [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
  ];
  for (const file of pre0006) {
    await db.exec(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
  // Simulate an older 0005 workspace that still had DEFAULT 1 on min_valid_minutes
  await db.exec("alter table public.focus_sessions alter column min_valid_minutes set default 1;");

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'alex@focusgate.local', '{"display_name":"Alex Morgan"}'::jsonb)`,
    [SEED_USER],
  );
  await db.exec(await readFile(SEED_SQL, "utf8"));

  // 1) Legitimate active session started when min_valid=1, then user raises setting to 60 mid-session
  await db.query("update public.user_settings set min_valid_focus_minutes = 1 where user_id = $1", [
    SEED_USER,
  ]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [SEED_USER]);
  await db.exec("set role authenticated");
  const started = await db.query<{ res: { sessionId: string; minValidMinutes: number } }>(
    `select public.rpc_start_focus_session(
       $1, 'local-mig-legit-1', 25,
       'pomodoro_25_5'::public.focus_mode, null, null
     ) as res`,
    [SEED_DEVICE],
  );
  await db.exec("reset role");
  const legitSessionId = started.rows[0]!.res.sessionId;
  assert.equal(started.rows[0]!.res.minValidMinutes, 1);

  await db.query(
    "update public.focus_sessions set started_at = now() - interval '15 minutes' where id = $1",
    [legitSessionId],
  );
  await db.query(
    "update public.user_settings set min_valid_focus_minutes = 60 where user_id = $1",
    [SEED_USER],
  );

  // 2) Safe legacy repair user: settings.updated_at <= started_at, stored=50, current=60
  const SAFE_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const SAFE_DEV = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'safe@focusgate.local', '{"display_name":"Safe User"}'::jsonb)`,
    [SAFE_USER],
  );
  await setUserSettingsHistory(db, SAFE_USER, 60, "now() - interval '3 hours'");
  await db.query(
    "insert into public.devices (id, user_id, name, platform) values ($1, $2, 'Safe PC', 'web')",
    [SAFE_DEV, SAFE_USER],
  );
  const safeLegacyId = (
    await db.query<{ id: string }>(
      `insert into public.focus_sessions
         (user_id, device_id, client_id, mode, planned_minutes, min_valid_minutes, status, started_at)
       values ($1, $2, 'safe-legacy-25-50', 'pomodoro_25_5', 25, 50, 'running', now() - interval '30 minutes')
       returning id`,
      [SAFE_USER, SAFE_DEV],
    )
  ).rows[0]!.id;

  // Run incremental upgrade from 0005 -> MUST supersede 0006 (not execute it) and apply 0007
  const upgradeFrom0005 = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(upgradeFrom0005.superseded, [
    "20260101000006_legacy_snapshot_and_insert_hardening.sql",
  ]);
  assert.deepEqual(upgradeFrom0005.applied, [
    "20260101000007_focus_snapshot_backfill_safety.sql",
  ]);

  const marker0006 = await db.query<{ value: string }>(
    "select value from auth.local_meta where key = 'migration:20260101000006_legacy_snapshot_and_insert_hardening.sql'",
  );
  assert.equal(marker0006.rows[0]?.value, "superseded_by_0007");

  // Legitimate snapshot MUST remain 1
  const legitCheck = await db.query<{ min_valid_minutes: number }>(
    "select min_valid_minutes from public.focus_sessions where id = $1",
    [legitSessionId],
  );
  assert.equal(legitCheck.rows[0]?.min_valid_minutes, 1);

  // Safe legacy session MUST be repaired 50 -> 60
  const safeCheck = await db.query<{ min_valid_minutes: number }>(
    "select min_valid_minutes from public.focus_sessions where id = $1",
    [safeLegacyId],
  );
  assert.equal(safeCheck.rows[0]?.min_valid_minutes, 60);

  // Repeated run must be a no-op
  const repeatCheck = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(repeatCheck.applied, []);
  assert.deepEqual(repeatCheck.superseded, []);

  // Upgrade from 0006 (where column_default is ALREADY NULL and 0007 marker is absent) -> runs 0007
  await db.query(
    "delete from auth.local_meta where key = 'migration:20260101000007_focus_snapshot_backfill_safety.sql'",
  );
  const upgradeFrom0006 = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(upgradeFrom0006.applied, [
    "20260101000007_focus_snapshot_backfill_safety.sql",
  ]);

  // Historical valid completed seed credits remain untouched (183m)
  const hist = await db.query<{ minutes: number }>(
    "select coalesce(sum(credited_minutes) filter (where is_valid), 0)::int as minutes from public.focus_sessions where user_id = $1 and status = 'completed'",
    [SEED_USER],
  );
  assert.equal(hist.rows[0]?.minutes, 183);

  await db.close();
});

test("Local migrations: failed migration never writes a false applied marker", async () => {
  const db = await createBootstrappedDb();
  await applyLocalMigrations(db, MIGRATIONS_DIR);

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "focusgate-mig-fail-"));
  try {
    const failingFile = "20260101000099_intentional_failure.sql";
    await writeFile(path.join(tmpDir, failingFile), "begin; select * from nonexistent_table_xyz; commit;");

    await assert.rejects(() => applyLocalMigrations(db, tmpDir));

    const marker = await db.query<{ present: boolean }>(
      "select exists(select 1 from auth.local_meta where key = $1) as present",
      [`migration:${failingFile}`],
    );
    assert.equal(marker.rows[0]?.present, false);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
    await db.close();
  }
});
