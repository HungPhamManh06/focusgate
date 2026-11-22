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

async function applySpecificMigrations(db: PGlite, filenames: string[]): Promise<void> {
  for (const file of filenames) {
    await db.exec(await readFile(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
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

test("Scenario A — Existing 0005 upgrade: supersedes 0006, applies 0007+0008, protects legit 1, repairs safe 50->60", async () => {
  const db = await createBootstrappedDb();

  await applySpecificMigrations(db, [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
  ]);
  await db.exec("alter table public.focus_sessions alter column min_valid_minutes set default 1;");

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'alex@focusgate.local', '{"display_name":"Alex Morgan"}'::jsonb)`,
    [SEED_USER],
  );
  await db.exec(await readFile(SEED_SQL, "utf8"));

  // Legitimate active session started with threshold 1, then setting raised to 60 after start
  await db.query("update public.user_settings set min_valid_focus_minutes = 1 where user_id = $1", [
    SEED_USER,
  ]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [SEED_USER]);
  await db.exec("set role authenticated");
  const started = await db.query<{ res: { sessionId: string; minValidMinutes: number } }>(
    `select public.rpc_start_focus_session(
       $1, 'scenario-a-legit-1', 25,
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

  // Safe legacy active session: stored 50, setting 60, updated_at <= started_at
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
       values ($1, $2, 'scenario-a-safe-legacy', 'pomodoro_25_5', 25, 50, 'running', now() - interval '30 minutes')
       returning id`,
      [SAFE_USER, SAFE_DEV],
    )
  ).rows[0]!.id;

  const orderCheck = await db.query<{ ok: boolean }>(
    `select (select updated_at from public.user_settings where user_id = $1) <=
            (select started_at from public.focus_sessions where id = $2) as ok`,
    [SAFE_USER, safeLegacyId],
  );
  assert.equal(orderCheck.rows[0]?.ok, true);

  const res = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(res.superseded, ["20260101000006_legacy_snapshot_and_insert_hardening.sql"]);
  assert.deepEqual(res.applied, [
    "20260101000007_focus_snapshot_backfill_safety.sql",
    "20260101000008_focus_migration_compatibility.sql",
    "20260101000009_focus_pause_resume.sql",
    "20260101000010_optional_task_focus_requirement.sql",
  ]);
  assert.deepEqual(res.recovered, []);

  const marker0006 = await db.query<{ value: string }>(
    "select value from auth.local_meta where key = 'migration:20260101000006_legacy_snapshot_and_insert_hardening.sql'",
  );
  assert.equal(marker0006.rows[0]?.value, "superseded_by_0007");

  const pending0006 = await db.query<{ present: boolean }>(
    "select exists(select 1 from auth.local_meta where key = 'pending_supersede:20260101000006_legacy_snapshot_and_insert_hardening.sql') as present",
  );
  assert.equal(pending0006.rows[0]?.present, false);

  const legitAfter = await db.query<{ min_valid_minutes: number }>(
    "select min_valid_minutes from public.focus_sessions where id = $1",
    [legitSessionId],
  );
  assert.equal(legitAfter.rows[0]?.min_valid_minutes, 1);

  const safeAfter = await db.query<{ min_valid_minutes: number }>(
    "select min_valid_minutes from public.focus_sessions where id = $1",
    [safeLegacyId],
  );
  assert.equal(safeAfter.rows[0]?.min_valid_minutes, 60);

  // Close `safeLegacyId` before inserting a new open session for `SAFE_USER`
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [SAFE_USER]);
  await db.exec("set role authenticated");
  await db.query("select public.rpc_cancel_focus_session($1)", [safeLegacyId]);
  await db.exec("reset role");

  const omittedInsert = await db.query<{ min_valid_minutes: number }>(
    `insert into public.focus_sessions
       (user_id, device_id, client_id, mode, planned_minutes, status, started_at)
     values ($1, $2, 'scenario-a-omitted', 'custom', 35, 'running', now())
     returning min_valid_minutes`,
    [SAFE_USER, SAFE_DEV],
  );
  assert.equal(omittedInsert.rows[0]?.min_valid_minutes, 60);

  await db.close();
});

test("Scenario B — Real existing 0006 upgrade: preserves 0006 marker as '1', runs 0007+0008, repairs safe, preserves ambiguous & credits", async () => {
  const db = await createBootstrappedDb();

  await applySpecificMigrations(db, [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
    "20260101000006_legacy_snapshot_and_insert_hardening.sql",
  ]);

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'alex@focusgate.local', '{"display_name":"Alex Morgan"}'::jsonb)`,
    [SEED_USER],
  );
  await db.exec(await readFile(SEED_SQL, "utf8"));

  const U_SAFE = "11111111-1111-4111-8111-111111111111";
  const D_SAFE = "11111111-1111-4111-8111-222222222222";
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'u_safe@focusgate.local', '{"display_name":"U Safe"}'::jsonb)`,
    [U_SAFE],
  );
  await setUserSettingsHistory(db, U_SAFE, 60, "now() - interval '4 hours'");
  await db.query(
    "insert into public.devices (id, user_id, name, platform) values ($1, $2, 'D Safe', 'web')",
    [D_SAFE, U_SAFE],
  );
  const safeId = (
    await db.query<{ id: string }>(
      `insert into public.focus_sessions
         (user_id, device_id, client_id, mode, planned_minutes, min_valid_minutes, status, started_at)
       values ($1, $2, 'scenario-b-safe', 'pomodoro_25_5', 25, 50, 'running', now() - interval '30 minutes')
       returning id`,
      [U_SAFE, D_SAFE],
    )
  ).rows[0]!.id;

  const U_AMB = "22222222-2222-4222-8222-111111111111";
  const D_AMB = "22222222-2222-4222-8222-222222222222";
  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'u_amb@focusgate.local', '{"display_name":"U Amb"}'::jsonb)`,
    [U_AMB],
  );
  await db.query(
    "update public.user_settings set min_valid_focus_minutes = 60 where user_id = $1",
    [U_AMB],
  );
  await db.query(
    "insert into public.devices (id, user_id, name, platform) values ($1, $2, 'D Amb', 'web')",
    [D_AMB, U_AMB],
  );
  const ambId = (
    await db.query<{ id: string }>(
      `insert into public.focus_sessions
         (user_id, device_id, client_id, mode, planned_minutes, min_valid_minutes, status, started_at)
       values ($1, $2, 'scenario-b-amb', 'pomodoro_25_5', 25, 50, 'running', now() - interval '30 minutes')
       returning id`,
      [U_AMB, D_AMB],
    )
  ).rows[0]!.id;

  const res = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(res.superseded, []);
  assert.deepEqual(res.applied, [
    "20260101000007_focus_snapshot_backfill_safety.sql",
    "20260101000008_focus_migration_compatibility.sql",
    "20260101000009_focus_pause_resume.sql",
    "20260101000010_optional_task_focus_requirement.sql",
  ]);

  const marker0006 = await db.query<{ value: string }>(
    "select value from auth.local_meta where key = 'migration:20260101000006_legacy_snapshot_and_insert_hardening.sql'",
  );
  assert.equal(marker0006.rows[0]?.value, "1");

  const safeRow = await db.query<{ min_valid_minutes: number }>(
    "select min_valid_minutes from public.focus_sessions where id = $1",
    [safeId],
  );
  assert.equal(safeRow.rows[0]?.min_valid_minutes, 60);

  const ambRow = await db.query<{ min_valid_minutes: number }>(
    "select min_valid_minutes from public.focus_sessions where id = $1",
    [ambId],
  );
  assert.equal(ambRow.rows[0]?.min_valid_minutes, 50);

  const hist = await db.query<{ minutes: number }>(
    "select coalesce(sum(credited_minutes) filter (where is_valid), 0)::int as minutes from public.focus_sessions where user_id = $1 and status = 'completed'",
    [SEED_USER],
  );
  assert.equal(hist.rows[0]?.minutes, 183);

  await db.close();
});

test("Scenario C — Interrupted 0005 upgrade: recovers 0006 as 'superseded_by_0007' without re-running 0007 and applies 0008", async () => {
  const db = await createBootstrappedDb();

  await applySpecificMigrations(db, [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
    "20260101000007_focus_snapshot_backfill_safety.sql",
  ]);

  await db.query(
    `insert into auth.users (id, email, raw_user_meta_data)
     values ($1, 'alex@focusgate.local', '{"display_name":"Alex Morgan"}'::jsonb)`,
    [SEED_USER],
  );
  await db.exec(await readFile(SEED_SQL, "utf8"));

  // Construct exact post-0007 / pre-0006-marker interrupted state:
  // - 0001..0005 marked '1'
  // - 0007 marked '1'
  // - 0006 marker ABSENT
  // - pending_supersede:0006 PRESENT
  // - 0008 pending
  for (const m of [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
    "20260101000007_focus_snapshot_backfill_safety.sql",
  ]) {
    await db.query(
      "insert into auth.local_meta (key, value) values ($1, '1') on conflict (key) do nothing",
      [`migration:${m}`],
    );
  }
  await db.query(
    "insert into auth.local_meta (key, value) values ('pending_supersede:20260101000006_legacy_snapshot_and_insert_hardening.sql', 'superseded_by_0007')",
  );

  const res = await applyLocalMigrations(db, MIGRATIONS_DIR);
  assert.deepEqual(res.recovered, ["20260101000006_legacy_snapshot_and_insert_hardening.sql"]);
  assert.deepEqual(res.superseded, ["20260101000006_legacy_snapshot_and_insert_hardening.sql"]);
  // 0007 was NOT re-executed because its marker already existed; 0008+0009 WERE applied
  assert.deepEqual(res.applied, [
    "20260101000008_focus_migration_compatibility.sql",
    "20260101000009_focus_pause_resume.sql",
    "20260101000010_optional_task_focus_requirement.sql",
  ]);

  const marker0006 = await db.query<{ value: string }>(
    "select value from auth.local_meta where key = 'migration:20260101000006_legacy_snapshot_and_insert_hardening.sql'",
  );
  assert.equal(marker0006.rows[0]?.value, "superseded_by_0007");

  const pending0006 = await db.query<{ present: boolean }>(
    "select exists(select 1 from auth.local_meta where key = 'pending_supersede:20260101000006_legacy_snapshot_and_insert_hardening.sql') as present",
  );
  assert.equal(pending0006.rows[0]?.present, false);

  const hist = await db.query<{ minutes: number }>(
    "select coalesce(sum(credited_minutes) filter (where is_valid), 0)::int as minutes from public.focus_sessions where user_id = $1 and status = 'completed'",
    [SEED_USER],
  );
  assert.equal(hist.rows[0]?.minutes, 183);

  await db.close();
});

test("Scenario D — Failure before 0007 completes: keeps pending_supersede, never marks 0006 applied/superseded, and recovers on retry", async () => {
  const db = await createBootstrappedDb();

  await applySpecificMigrations(db, [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
  ]);
  await db.exec("alter table public.focus_sessions alter column min_valid_minutes set default 1;");

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "focusgate-0007-fail-"));
  try {
    for (const f of [
      "20260101000001_init.sql",
      "20260101000002_plan_and_reward.sql",
      "20260101000003_backend_hardening.sql",
      "20260101000004_focus_session_integrity.sql",
      "20260101000005_focus_validity_snapshot.sql",
      "20260101000006_legacy_snapshot_and_insert_hardening.sql",
    ]) {
      await writeFile(path.join(tmpDir, f), await readFile(path.join(MIGRATIONS_DIR, f), "utf8"));
    }
    // Failing 0007
    await writeFile(
      path.join(tmpDir, "20260101000007_focus_snapshot_backfill_safety.sql"),
      "begin; select * from missing_table_0007_failure; commit;",
    );

    await assert.rejects(() => applyLocalMigrations(db, tmpDir));

    // 0006 must NOT be marked applied or superseded; pending_supersede must remain
    const marker0006 = await db.query<{ present: boolean }>(
      "select exists(select 1 from auth.local_meta where key = 'migration:20260101000006_legacy_snapshot_and_insert_hardening.sql') as present",
    );
    assert.equal(marker0006.rows[0]?.present, false);

    const pending0006 = await db.query<{ value: string }>(
      "select value from auth.local_meta where key = 'pending_supersede:20260101000006_legacy_snapshot_and_insert_hardening.sql'",
    );
    assert.equal(pending0006.rows[0]?.value, "superseded_by_0007");

    // Retry with real MIGRATIONS_DIR -> succeeds, marks 0006 superseded_by_0007, applies 0007+0008
    const retryRes = await applyLocalMigrations(db, MIGRATIONS_DIR);
    assert.deepEqual(retryRes.superseded, [
      "20260101000006_legacy_snapshot_and_insert_hardening.sql",
    ]);
    assert.deepEqual(retryRes.applied, [
      "20260101000007_focus_snapshot_backfill_safety.sql",
      "20260101000008_focus_migration_compatibility.sql",
      "20260101000009_focus_pause_resume.sql",
      "20260101000010_optional_task_focus_requirement.sql",
    ]);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
    await db.close();
  }
});

test("Scenario E — Existing 0007 database & Fresh 0001..0008: applies 0008 only, repeated run is no-op", async () => {
  // 1. Existing 0007 database
  const db0007 = await createBootstrappedDb();
  await applySpecificMigrations(db0007, [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
    "20260101000006_legacy_snapshot_and_insert_hardening.sql",
    "20260101000007_focus_snapshot_backfill_safety.sql",
  ]);
  for (const m of [
    "20260101000001_init.sql",
    "20260101000002_plan_and_reward.sql",
    "20260101000003_backend_hardening.sql",
    "20260101000004_focus_session_integrity.sql",
    "20260101000005_focus_validity_snapshot.sql",
    "20260101000006_legacy_snapshot_and_insert_hardening.sql",
    "20260101000007_focus_snapshot_backfill_safety.sql",
  ]) {
    await db0007.query(
      "insert into auth.local_meta (key, value) values ($1, '1') on conflict (key) do nothing",
      [`migration:${m}`],
    );
  }

  const res0007 = await applyLocalMigrations(db0007, MIGRATIONS_DIR);
  assert.deepEqual(res0007.applied, [
    "20260101000008_focus_migration_compatibility.sql",
    "20260101000009_focus_pause_resume.sql",
    "20260101000010_optional_task_focus_requirement.sql",
  ]);
  assert.deepEqual(res0007.superseded, []);

  const repeat0007 = await applyLocalMigrations(db0007, MIGRATIONS_DIR);
  assert.deepEqual(repeat0007.applied, []);
  assert.deepEqual(repeat0007.superseded, []);
  await db0007.close();

  // 2. Fresh 0001..0010 installation
  const dbFresh = await createBootstrappedDb();
  const freshFirst = await applyLocalMigrations(dbFresh, MIGRATIONS_DIR);
  assert.equal(freshFirst.applied.length, 10);
  assert.deepEqual(freshFirst.superseded, []);

  const freshSecond = await applyLocalMigrations(dbFresh, MIGRATIONS_DIR);
  assert.deepEqual(freshSecond.applied, []);
  assert.deepEqual(freshSecond.superseded, []);
  await dbFresh.close();
});
