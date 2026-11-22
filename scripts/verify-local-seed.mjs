#!/usr/bin/env node
/**
 * Verifies the web app's local workspace: bootstrap + real migrations + seed.
 * Uses an in-memory PGlite instance so it cannot touch the running app database.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = process.cwd();
const USER = "9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const db = new PGlite();
await db.exec(await readFile(path.join(ROOT, "apps/web/lib/db/local/bootstrap.sql"), "utf8"));

const migrationsDir = path.join(ROOT, "supabase/migrations");
for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort()) {
  await db.exec(await readFile(path.join(migrationsDir, file), "utf8"));
}

await db.query(
  `insert into auth.users (id, email, raw_user_meta_data)
   values ($1, $2, '{"display_name":"Alex Morgan"}'::jsonb)`,
  [USER, "alex@focusgate.local"],
);

await db.exec(await readFile(path.join(ROOT, "apps/web/lib/db/local/seed.sql"), "utf8"));

const profile = await db.query("select display_name, timezone from public.profiles where id = $1", [USER]);
check("profile seeded", profile.rows[0]?.display_name === "Alex Morgan", JSON.stringify(profile.rows[0]));

const tasks = await db.query("select count(*)::int as n from public.tasks where user_id = $1", [USER]);
check("8 tasks seeded", tasks.rows[0].n === 8, `count=${tasks.rows[0].n}`);

const plan = await db.query(
  `select p.id, p.status, count(pt.id)::int as tasks
   from public.daily_plans p
   left join public.daily_plan_tasks pt on pt.plan_id = p.id
   where p.user_id = $1 and p.plan_date = (now() at time zone 'Asia/Ho_Chi_Minh')::date
   group by p.id, p.status`,
  [USER],
);
check("today's draft plan has 4 tasks", plan.rows[0]?.status === "draft" && plan.rows[0]?.tasks === 4, JSON.stringify(plan.rows[0]));

const sessions = await db.query(
  `select count(*)::int as n,
          coalesce(sum(credited_minutes) filter (where is_valid), 0)::int as minutes,
          count(*) filter (where min_valid_minutes < 1)::int as invalid_snapshots
   from public.focus_sessions where user_id = $1`,
  [USER],
);
check(
  "focus sessions valid with credited_minutes and min_valid_minutes snapshots",
  sessions.rows[0].n === 6 &&
    sessions.rows[0].minutes > 100 &&
    sessions.rows[0].invalid_snapshots === 0,
  JSON.stringify(sessions.rows[0]),
);

// Also verify incremental upgrade path (simulating an existing workspace at 0004 with legacy active sessions
// where planned_minutes * 2 < min_valid_focus_minutes, upgraded through 0005 and 0006)
const dbUpgrade = new PGlite();
await dbUpgrade.exec(await readFile(path.join(ROOT, "apps/web/lib/db/local/bootstrap.sql"), "utf8"));
const pre0005Files = [
  "20260101000001_init.sql",
  "20260101000002_plan_and_reward.sql",
  "20260101000003_backend_hardening.sql",
  "20260101000004_focus_session_integrity.sql",
];
for (const file of pre0005Files) {
  await dbUpgrade.exec(await readFile(path.join(migrationsDir, file), "utf8"));
}
await dbUpgrade.query(
  `insert into auth.users (id, email, raw_user_meta_data)
   values ($1, $2, '{"display_name":"Alex Morgan"}'::jsonb)`,
  [USER, "alex@focusgate.local"],
);
await dbUpgrade.exec(await readFile(path.join(ROOT, "apps/web/lib/db/local/seed.sql"), "utf8"));

// Create two additional users in the pre-0005 database with active running sessions whose user_settings
// threshold (60 and 120) exceeds 2x their planned duration (25 and 50), plus a historical invalid session.
const LEGACY_U1 = "77777777-7777-4777-8777-777777777777";
const LEGACY_U2 = "88888888-8888-4888-8888-888888888888";
await dbUpgrade.query(
  `insert into auth.users (id, email, raw_user_meta_data)
   values ($1, 'legacy1@focusgate.local', '{"display_name":"Legacy One"}'::jsonb),
          ($2, 'legacy2@focusgate.local', '{"display_name":"Legacy Two"}'::jsonb)`,
  [LEGACY_U1, LEGACY_U2],
);
await dbUpgrade.query(
  "update public.user_settings set min_valid_focus_minutes = 60 where user_id = $1",
  [LEGACY_U1],
);
await dbUpgrade.query(
  "update public.user_settings set min_valid_focus_minutes = 120 where user_id = $1",
  [LEGACY_U2],
);
const dev1 = (
  await dbUpgrade.query(
    "insert into public.devices (user_id, name, platform) values ($1, 'L1 PC', 'web') returning id",
    [LEGACY_U1],
  )
).rows[0].id;
const dev2 = (
  await dbUpgrade.query(
    "insert into public.devices (user_id, name, platform) values ($1, 'L2 PC', 'web') returning id",
    [LEGACY_U2],
  )
).rows[0].id;

// Insert a historical invalid completed session (10m actual < 60m threshold) before 0005
const histInvalidId = (
  await dbUpgrade.query(
    `insert into public.focus_sessions
       (user_id, device_id, client_id, mode, planned_minutes, actual_minutes, status, started_at, ended_at)
     values ($1, $2, 'legacy-hist-invalid', 'pomodoro_25_5', 25, 10, 'completed', now() - interval '2 hours', now() - interval '110 minutes')
     returning id`,
    [LEGACY_U1, dev1],
  )
).rows[0].id;

// Insert active running sessions before 0005:
// - LEGACY_U1: 25 planned / 60 threshold
// - LEGACY_U2: 50 planned / 120 threshold
const active25_60 = (
  await dbUpgrade.query(
    `insert into public.focus_sessions
       (user_id, device_id, client_id, mode, planned_minutes, status, started_at)
     values ($1, $2, 'legacy-active-25-60', 'pomodoro_25_5', 25, 'running', now() - interval '70 minutes')
     returning id`,
    [LEGACY_U1, dev1],
  )
).rows[0].id;

const active50_120 = (
  await dbUpgrade.query(
    `insert into public.focus_sessions
       (user_id, device_id, client_id, mode, planned_minutes, status, started_at)
     values ($1, $2, 'legacy-active-50-120', 'pomodoro_50_10', 50, 'running', now() - interval '130 minutes')
     returning id`,
    [LEGACY_U2, dev2],
  )
).rows[0].id;

// Now apply 0005 and 0006
await dbUpgrade.exec(
  await readFile(path.join(migrationsDir, "20260101000005_focus_validity_snapshot.sql"), "utf8"),
);
await dbUpgrade.exec(
  await readFile(
    path.join(migrationsDir, "20260101000006_legacy_snapshot_and_insert_hardening.sql"),
    "utf8",
  ),
);

const upgradedRows = await dbUpgrade.query(
  `select count(*)::int as n,
          coalesce(sum(credited_minutes) filter (where is_valid), 0)::int as minutes,
          min(min_valid_minutes)::int as min_snap
   from public.focus_sessions where user_id = $1`,
  [USER],
);
check(
  "incremental migration 0005+0006 upgrade preserves historical valid completed sessions & credits",
  upgradedRows.rows[0].n === 6 &&
    upgradedRows.rows[0].minutes === sessions.rows[0].minutes &&
    upgradedRows.rows[0].min_snap >= 1,
  JSON.stringify(upgradedRows.rows[0]),
);

const histInvalidRow = (
  await dbUpgrade.query(
    "select is_valid, credited_minutes, min_valid_minutes from public.focus_sessions where id = $1",
    [histInvalidId],
  )
).rows[0];
check(
  "historical invalid session remains invalid with 0 credit after backfill",
  histInvalidRow.is_valid === false &&
    histInvalidRow.credited_minutes === 0 &&
    histInvalidRow.min_valid_minutes === 60,
  JSON.stringify(histInvalidRow),
);

const snap25_60 = (
  await dbUpgrade.query("select min_valid_minutes from public.focus_sessions where id = $1", [
    active25_60,
  ])
).rows[0];
check(
  "legacy active 25m planned / 60m threshold preserves backfilled min_valid_minutes = 60 (not clamped to 50)",
  snap25_60.min_valid_minutes === 60,
  JSON.stringify(snap25_60),
);

const snap50_120 = (
  await dbUpgrade.query("select min_valid_minutes from public.focus_sessions where id = $1", [
    active50_120,
  ])
).rows[0];
check(
  "legacy active 50m planned / 120m threshold preserves backfilled min_valid_minutes = 120 (not clamped to 100)",
  snap50_120.min_valid_minutes === 120,
  JSON.stringify(snap50_120),
);

// Completing the legacy active 25/60 session (even after 70m elapsed) cannot mark it valid
await dbUpgrade.query("select set_config('request.jwt.claim.sub', $1, false)", [LEGACY_U1]);
await dbUpgrade.exec("set role authenticated");
const comp25_60 = (
  await dbUpgrade.query("select public.rpc_complete_focus_session($1) as res", [active25_60])
).rows[0].res;
await dbUpgrade.exec("reset role");
check(
  "completing legacy active 25/60 session cannot mark it valid and awards 0 credit",
  comp25_60.isValid === false &&
    comp25_60.creditedMinutes === 0 &&
    comp25_60.minValidMinutes === 60,
  JSON.stringify(comp25_60),
);

// Also test upgrade from the old 0005 (where 25/60 was clamped to 50 and DEFAULT 1 was present) -> 0006 fixes both!
await dbUpgrade.exec("alter table public.focus_sessions disable trigger user");
await dbUpgrade.query(
  "update public.focus_sessions set min_valid_minutes = 100 where id = $1",
  [active50_120],
);
await dbUpgrade.exec("alter table public.focus_sessions enable trigger user");
await dbUpgrade.exec(
  await readFile(
    path.join(migrationsDir, "20260101000006_legacy_snapshot_and_insert_hardening.sql"),
    "utf8",
  ),
);
const repaired50_120 = (
  await dbUpgrade.query("select min_valid_minutes from public.focus_sessions where id = $1", [
    active50_120,
  ])
).rows[0];
check(
  "migration 0006 repairs an active session previously clamped to 2x planned (100 -> 120)",
  repaired50_120.min_valid_minutes === 120,
  JSON.stringify(repaired50_120),
);

await dbUpgrade.close();

const wallet = await db.query(
  `select coalesce(sum(remaining_minutes) filter (where status = 'active' and expires_at > now()), 0)::int as remaining,
          coalesce(sum(granted_minutes), 0)::int as granted,
          coalesce(sum(consumed_minutes), 0)::int as consumed
   from public.unlock_grants where user_id = $1`,
  [USER],
);
check(
  "wallet has 35 minutes available",
  wallet.rows[0].remaining === 35 && wallet.rows[0].granted === 45 && wallet.rows[0].consumed === 10,
  JSON.stringify(wallet.rows[0]),
);

const ledger = await db.query("select count(*)::int as n from public.reward_ledger where user_id = $1", [USER]);
check("ledger has grant + consumption", ledger.rows[0].n === 2, `rows=${ledger.rows[0].n}`);

const stats = await db.query(
  `select count(*)::int as completed from public.tasks
   where user_id = $1 and status = 'completed'`,
  [USER],
);
check("completed history exists for statistics", stats.rows[0].completed === 4, `completed=${stats.rows[0].completed}`);

const usage = await db.query("select count(*)::int as n, sum(duration_seconds)::int as secs from public.usage_events where user_id = $1", [USER]);
check("usage history seeded", usage.rows[0].n === 2 && usage.rows[0].secs === 3900, JSON.stringify(usage.rows[0]));

await db.close();
console.log(`\n${failures === 0 ? "Local workspace OK" : `${failures} failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
