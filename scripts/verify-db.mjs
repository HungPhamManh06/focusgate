#!/usr/bin/env node
/**
 * FocusGate database verification.
 *
 * Runs the actual Supabase migrations against PGlite (PostgreSQL compiled to
 * WASM) with a minimal Supabase-compatible auth stub, then exercises the RLS
 * policies and RPCs with multiple users.
 *
 * This is a development check, not a production environment: it does not
 * replace `supabase db reset` against the real Supabase stack, but it proves
 * the SQL parses, the functions work and the security invariants hold.
 *
 * Usage: node scripts/verify-db.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const ROOT = process.cwd();
const MIGRATIONS = [
  "supabase/migrations/20260101000001_init.sql",
  "supabase/migrations/20260101000002_plan_and_reward.sql",
  "supabase/migrations/20260101000003_backend_hardening.sql",
  "supabase/migrations/20260101000004_focus_session_integrity.sql",
  "supabase/migrations/20260101000005_focus_validity_snapshot.sql",
];

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

let failures = 0;
let passes = 0;

function check(name, ok, detail = "") {
  if (ok) passes += 1;
  else failures += 1;
  const suffix = detail ? ` — ${String(detail).split("\n")[0]}` : "";
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${suffix}`);
}

async function expectError(name, fn, needle) {
  try {
    await fn();
    check(name, false, "expected an error, but the call succeeded");
  } catch (error) {
    const message = String(error?.message ?? error);
    check(name, needle ? message.toLowerCase().includes(needle.toLowerCase()) : true, message);
  }
}

const db = new PGlite();

async function asUser(userId, fn) {
  await db.exec("reset role; set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function asSuperuser(fn) {
  await db.exec("reset role");
  return fn();
}

console.log("FocusGate database verification (PGlite)\n");

// ---------------------------------------------------------------------------
// Supabase-compatible harness: roles, auth.users and auth.uid().
// ---------------------------------------------------------------------------
await db.exec(`
  create schema auth;

  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );

  create or replace function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then
      create role service_role nologin;
    end if;
  end $$;

  grant usage on schema auth to authenticated, anon;
  grant select on auth.users to authenticated;
`);

for (const file of MIGRATIONS) {
  const sql = readFileSync(path.join(ROOT, file), "utf8");
  try {
    await db.exec(sql);
    check(`migration applied: ${path.basename(file)}`, true);
  } catch (error) {
    check(`migration applied: ${path.basename(file)}`, false, error.message);
    console.error("\nMigration failed; aborting.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Authentication trigger: safe names, profile validation.
// ---------------------------------------------------------------------------
await db.query(
  `insert into auth.users (id, email, raw_user_meta_data)
   values ($1, $2, $3::jsonb), ($4, $5, $6::jsonb)`,
  [USER_A, "alice@example.com", '{"display_name":"Alice"}',
   USER_B, "bob@example.com", '{"display_name":"Bob"}'],
);

const profileRows = await db.query("select count(*)::int as n from public.profiles");
check("profile trigger created both profiles", profileRows.rows[0].n === 2, `count=${profileRows.rows[0].n}`);

const settingsRows = await db.query(
  "select base_minutes, daily_cap_minutes, max_bonus_minutes from public.user_settings limit 1",
);
check(
  "default reward settings (30 base / 60 cap / 30 bonus limit)",
  settingsRows.rows[0]?.base_minutes === 30 &&
    settingsRows.rows[0]?.daily_cap_minutes === 60 &&
    settingsRows.rows[0]?.max_bonus_minutes === 30,
  JSON.stringify(settingsRows.rows[0] ?? {}),
);

const LONG_USER = "33333333-3333-4333-8333-333333333333";
await db.query(
  "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
  [LONG_USER, "long@example.com", JSON.stringify({ display_name: "x".repeat(200) })],
);
const longName = await db.query("select char_length(display_name)::int as n from public.profiles where id = $1", [LONG_USER]);
check("auth trigger truncates an oversized display name to 80", longName.rows[0]?.n === 80, `length=${longName.rows[0]?.n}`);

const BLANK_USER = "44444444-4444-4444-8444-444444444444";
await db.query(
  "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
  [BLANK_USER, "noname@example.com", '{"display_name":"   "}'],
);
const blankName = await db.query("select display_name from public.profiles where id = $1", [BLANK_USER]);
check("auth trigger falls back to the email local part", blankName.rows[0]?.display_name === "noname", blankName.rows[0]?.display_name);

await expectError(
  "profile validation rejects an unknown timezone",
  () => asUser(USER_A, () => db.query("update public.profiles set timezone = 'Mars/Olympus' where id = $1", [USER_A])),
  "timezone",
);
await expectError(
  "profile validation rejects a blank display name",
  () => asUser(USER_A, () => db.query("update public.profiles set display_name = '   ' where id = $1", [USER_A])),
  "display name",
);

// ---------------------------------------------------------------------------
// Setup: two users, devices and tasks.
// ---------------------------------------------------------------------------
let deviceA;
let deviceB;
let mustDoTask;
let bonusTask;
let bobTask;

await asUser(USER_A, async () => {
  const device = await db.query(
    `insert into public.devices (user_id, name, platform)
     values ($1, 'Alice PC', 'windows') returning id`,
    [USER_A],
  );
  deviceA = device.rows[0].id;

  const mustDo = await db.query(
    `insert into public.tasks (user_id, title, kind, required_focus_minutes, estimated_minutes)
     values ($1, 'Write the report', 'must_do', 25, 30) returning id`,
    [USER_A],
  );
  mustDoTask = mustDo.rows[0].id;

  const bonus = await db.query(
    `insert into public.tasks (user_id, title, kind, required_focus_minutes, estimated_minutes)
     values ($1, 'Read one chapter', 'bonus', 10, 10) returning id`,
    [USER_A],
  );
  bonusTask = bonus.rows[0].id;
});

await asUser(USER_B, async () => {
  const device = await db.query(
    `insert into public.devices (user_id, name, platform)
     values ($1, 'Bob PC', 'windows') returning id`,
    [USER_B],
  );
  deviceB = device.rows[0].id;
  const task = await db.query(
    `insert into public.tasks (user_id, title, kind, required_focus_minutes, estimated_minutes)
     values ($1, 'Bob task', 'must_do', 5, 5) returning id`,
    [USER_B],
  );
  bobTask = task.rows[0].id;
});

check("user A created device and tasks", Boolean(deviceA && mustDoTask && bonusTask));
check("user B created device and task", Boolean(deviceB && bobTask));

await asUser(USER_B, async () => {
  const tasks = await db.query("select count(*)::int as n from public.tasks where user_id = $1", [USER_A]);
  const focus = await db.query("select count(*)::int as n from public.focus_sessions where user_id = $1", [USER_A]);
  check("RLS: user B cannot read user A tasks", tasks.rows[0].n === 0, `visible=${tasks.rows[0].n}`);
  check("RLS: user B cannot read user A focus sessions", focus.rows[0].n === 0, `visible=${focus.rows[0].n}`);
});

await asUser(USER_B, async () => {
  const rows = await db.query(
    "update public.tasks set title = 'hijacked' where id = $1 returning id",
    [mustDoTask],
  );
  check("RLS: user B cannot update user A tasks", rows.rows.length === 0);
});

// ---------------------------------------------------------------------------
// Plan lifecycle. Draft edits are allowed; commits are RPC-only.
// ---------------------------------------------------------------------------
let planId;
let mustDoPlanTask;
let bonusPlanTask;

await asUser(USER_A, async () => {
  const created = await db.query("select public.rpc_create_daily_plan(current_date) as res");
  planId = created.rows[0].res.planId;
  const again = await db.query("select public.rpc_create_daily_plan(current_date) as res");
  check("rpc_create_daily_plan is idempotent per date", again.rows[0].res.planId === planId);
});

await asUser(USER_A, async () => {
  const mustDo = await db.query(
    "select public.rpc_add_plan_task($1, $2, 'must_do'::public.task_kind) as res",
    [planId, mustDoTask],
  );
  mustDoPlanTask = mustDo.rows[0].res.planTaskId;

  const bonus = await db.query(
    "select public.rpc_add_plan_task($1, $2, 'bonus'::public.task_kind) as res",
    [planId, bonusTask],
  );
  bonusPlanTask = bonus.rows[0].res.planTaskId;
  check("plan tasks added with kind snapshots", Boolean(mustDoPlanTask && bonusPlanTask));
});

await expectError(
  "guard: direct plan status change is refused",
  () => asUser(USER_A, () => db.query(
    "update public.daily_plans set status = 'confirmed' where id = $1",
    [planId],
  )),
  "rpc",
);

await expectError(
  "guard: direct plan event insert is refused",
  () => asUser(USER_A, () => db.query(
    `insert into public.daily_plan_events (plan_id, user_id, event_type)
     values ($1, $2, 'created')`,
    [planId, USER_A],
  )),
  "permission denied",
);

await asUser(USER_A, async () => {
  const confirmed = await db.query("select public.rpc_confirm_plan($1) as res", [planId]);
  const activated = await db.query("select public.rpc_activate_plan($1) as res", [planId]);
  check(
    "plan reaches active through RPCs",
    confirmed.rows[0].res.status === "confirmed" && activated.rows[0].res.status === "active",
  );
});

await asUser(USER_A, async () => {
  await db.query("delete from public.daily_plan_tasks where id = $1", [mustDoPlanTask]);
});
const mustDoStillThere = await asUser(USER_A, async () => {
  const rows = await db.query(
    "select count(*)::int as n from public.daily_plan_tasks where id = $1",
    [mustDoPlanTask],
  );
  return rows.rows[0].n;
});
check("committed Must Do task cannot be deleted by the client", mustDoStillThere === 1);

await expectError(
  "committed Must Do cannot be downgraded without a reason",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_amend_plan_task($1, 'should_do'::public.task_kind, null)",
    [mustDoPlanTask],
  )),
  "reason",
);

await asUser(USER_A, async () => {
  const amended = await db.query(
    "select public.rpc_amend_plan_task($1, 'must_do'::public.task_kind, null) as res",
    [mustDoPlanTask],
  );
  check("no-op amendment is reported as unchanged", amended.rows[0].res.changed === false);
});

await expectError(
  "task cannot be completed without focus time",
  () => asUser(USER_A, () => db.query("select public.rpc_complete_plan_task($1)", [mustDoPlanTask])),
  "focus",
);

// ---------------------------------------------------------------------------
// Focus sessions are server-owned.
// ---------------------------------------------------------------------------
let focusSessionId;

await asUser(USER_A, async () => {
  const started = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-0001', 25, 'custom'::public.focus_mode, $2, $3
     ) as res`,
    [deviceA, mustDoTask, planId],
  );
  focusSessionId = started.rows[0].res.sessionId;
  check(
    "rpc_start_focus_session creates a running session with a server timestamp",
    started.rows[0].res.status === "running" && Boolean(started.rows[0].res.startedAt),
    JSON.stringify(started.rows[0].res),
  );

  const replay = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-0001', 25, 'custom'::public.focus_mode, $2, $3
     ) as res`,
    [deviceA, mustDoTask, planId],
  );
  check(
    "focus start replay returns the same session",
    replay.rows[0].res.sessionId === focusSessionId && replay.rows[0].res.idempotent === true,
    JSON.stringify(replay.rows[0].res),
  );
});

await expectError(
  "a second open session is refused",
  () => asUser(USER_A, () => db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-duplicate', 25, 'custom'::public.focus_mode, $2, $3
     )`,
    [deviceA, bonusTask, planId],
  )),
  "focus_session_active",
);

await expectError(
  "user B cannot start a session on user A's device",
  () => asUser(USER_B, () => db.query(
    `select public.rpc_start_focus_session(
       $1, 'bob-client-session-1', 5, 'custom'::public.focus_mode, $2, null
     )`,
    [deviceA, bobTask],
  )),
  "forbidden",
);

await expectError(
  "user B cannot start a session on user A's task",
  () => asUser(USER_B, () => db.query(
    `select public.rpc_start_focus_session(
       $1, 'bob-client-session-2', 5, 'custom'::public.focus_mode, $2, null
     )`,
    [deviceB, mustDoTask],
  )),
  "forbidden",
);

await expectError(
  "user B cannot complete user A's session",
  () => asUser(USER_B, () => db.query("select public.rpc_complete_focus_session($1)", [focusSessionId])),
  "forbidden",
);

await expectError(
  "user B cannot cancel user A's session",
  () => asUser(USER_B, () => db.query("select public.rpc_cancel_focus_session($1)", [focusSessionId])),
  "forbidden",
);

await expectError(
  "direct focus session inserts are revoked",
  () => asUser(USER_A, () => db.query(
    `insert into public.focus_sessions
       (user_id, task_id, daily_plan_id, device_id, client_id, mode,
        planned_minutes, actual_minutes, status, started_at)
     values ($1, $2, $3, $4, 'forged-client-0001', 'custom', 25, 25, 'running', now())`,
    [USER_A, mustDoTask, planId, deviceA],
  )),
  "permission denied",
);

await expectError(
  "direct focus session updates are revoked",
  () => asUser(USER_A, () => db.query(
    "update public.focus_sessions set actual_minutes = 500 where id = $1",
    [focusSessionId],
  )),
  "permission denied",
);

await expectError(
  "reward settings are read-only to clients",
  () => asUser(USER_A, () => db.query(
    "update public.user_settings set daily_cap_minutes = 999 where user_id = $1",
    [USER_A],
  )),
  "permission denied",
);

// Move the server clock back so the session has real elapsed time.
await asSuperuser(() => db.query(
  "update public.focus_sessions set started_at = now() - interval '26 minutes' where id = $1",
  [focusSessionId],
));

await asUser(USER_A, async () => {
  const completed = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [focusSessionId],
  );
  const res = completed.rows[0].res;
  check(
    "elapsed focus is derived from the server clock",
    res.actualMinutes >= 26 && res.isValid === true,
    JSON.stringify(res),
  );

  const replay = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [focusSessionId],
  );
  check("focus completion replay is idempotent", replay.rows[0].res.idempotent === true);
});

// A second, shorter focus session for the bonus task.
let bonusSessionId;
await asUser(USER_A, async () => {
  const started = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-0002', 10, 'custom'::public.focus_mode, $2, $3
     ) as res`,
    [deviceA, bonusTask, planId],
  );
  bonusSessionId = started.rows[0].res.sessionId;
});
await asSuperuser(() => db.query(
  "update public.focus_sessions set started_at = now() - interval '11 minutes' where id = $1",
  [bonusSessionId],
));
await asUser(USER_A, async () => {
  const completed = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [bonusSessionId],
  );
  check(
    "bonus session records 11 valid minutes",
    completed.rows[0].res.actualMinutes >= 11 && completed.rows[0].res.isValid === true,
    JSON.stringify(completed.rows[0].res),
  );
});

// Cancelling clears the open session and records nothing.
let cancelledSessionId;
await asUser(USER_A, async () => {
  const started = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-cancel', 5, 'custom'::public.focus_mode, null, null
     ) as res`,
    [deviceA],
  );
  cancelledSessionId = started.rows[0].res.sessionId;
  const cancelled = await db.query(
    "select public.rpc_cancel_focus_session($1) as res",
    [cancelledSessionId],
  );
  check("cancel marks the session cancelled", cancelled.rows[0].res.cancelled === true);
  const row = await db.query(
    "select status, actual_minutes, is_valid from public.focus_sessions where id = $1",
    [cancelledSessionId],
  );
  check(
    "cancelled session records no minutes",
    row.rows[0]?.status === "cancelled" && row.rows[0]?.actual_minutes === 0 && row.rows[0]?.is_valid === false,
    JSON.stringify(row.rows[0] ?? {}),
  );
});

// A session ended immediately is saved but invalid.
await asUser(USER_A, async () => {
  const started = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-short', 5, 'custom'::public.focus_mode, null, null
     ) as res`,
    [deviceA],
  );
  const completed = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [started.rows[0].res.sessionId],
  );
  check("a zero-minute session is stored but invalid", completed.rows[0].res.isValid === false);
});

await asUser(USER_A, async () => {
  const completed = await db.query(
    "select public.rpc_complete_plan_task($1) as res",
    [mustDoPlanTask],
  );
  check(
    "Must Do task completed after valid focus exists",
    completed.rows[0].res.completed === true && completed.rows[0].res.focusMinutes >= 25,
    JSON.stringify(completed.rows[0].res),
  );
  const bonus = await db.query(
    "select public.rpc_complete_plan_task($1) as res",
    [bonusPlanTask],
  );
  check("bonus task completed after its own focus exists", bonus.rows[0].res.completed === true);
});

// ---------------------------------------------------------------------------
// Grant requires a completed plan and is idempotent.
// ---------------------------------------------------------------------------
await expectError(
  "an active plan cannot be rewarded",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-00000001')",
    [planId, deviceA],
  )),
  "plan_not_active",
);

let grantId;
let grantMinutes;

await asUser(USER_A, async () => {
  const completed = await db.query("select public.rpc_complete_plan($1) as res", [planId]);
  check("plan completes once all Must Do tasks are done", completed.rows[0].res.status === "completed");
});

await asUser(USER_A, async () => {
  const result = await db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-00000001') as res",
    [planId, deviceA],
  );
  const res = result.rows[0].res;
  grantId = res.grantId;
  grantMinutes = res.grantedMinutes;
  check(
    "grant is 30 base + 5 bonus = 35 minutes",
    res.grantedMinutes === 35 && res.breakdown.base === 30 && res.breakdown.bonus === 5,
    JSON.stringify(res),
  );
  check("first grant is not a replay", res.idempotent === false);
});

function checkReplay(label, res, expectedGrantId) {
  check(label, res.idempotent === true && res.grantId === expectedGrantId, JSON.stringify(res));
}

await asUser(USER_A, async () => {
  const replay = await db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-00000001') as res",
    [planId, deviceA],
  );
  checkReplay("same idempotency key returns the same grant", replay.rows[0].res, grantId);

  const otherKey = await db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-00000002') as res",
    [planId, deviceA],
  );
  checkReplay("different key still cannot grant the plan twice", otherKey.rows[0].res, grantId);
});

// A second completed plan proves an idempotency key is bound to its plan.
let plan2Id;
await asUser(USER_A, async () => {
  const task2 = await db.query(
    `insert into public.tasks (user_id, title, kind, required_focus_minutes, estimated_minutes)
     values ($1, 'Second plan task', 'must_do', 2, 5) returning id`,
    [USER_A],
  );
  const created = await db.query("select public.rpc_create_daily_plan(current_date - 1) as res");
  plan2Id = created.rows[0].res.planId;
  await db.query("select public.rpc_add_plan_task($1, $2, 'must_do'::public.task_kind)", [plan2Id, task2.rows[0].id]);
  await db.query("select public.rpc_confirm_plan($1)", [plan2Id]);
  await db.query("select public.rpc_activate_plan($1)", [plan2Id]);
  const started = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-plan2', 4, 'custom'::public.focus_mode, $2, $3
     ) as res`,
    [deviceA, task2.rows[0].id, plan2Id],
  );
  await asSuperuser(() => db.query(
    "update public.focus_sessions set started_at = now() - interval '3 minutes' where id = $1",
    [started.rows[0].res.sessionId],
  ));
  await db.query("select public.rpc_complete_focus_session($1)", [started.rows[0].res.sessionId]);
  const pt = await db.query(
    "select id from public.daily_plan_tasks where plan_id = $1 and task_id = $2",
    [plan2Id, task2.rows[0].id],
  );
  await db.query("select public.rpc_complete_plan_task($1)", [pt.rows[0].id]);
  await db.query("select public.rpc_complete_plan($1)", [plan2Id]);
});

await expectError(
  "an idempotency key cannot be reused for another plan",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-00000001')",
    [plan2Id, deviceA],
  )),
  "idempotency_conflict",
);

const ledgerAfterGrant = await asUser(USER_A, async () => {
  const rows = await db.query("select count(*)::int as n from public.reward_ledger");
  return rows.rows[0].n;
});
check("only one grant ledger row exists", ledgerAfterGrant === 1, `rows=${ledgerAfterGrant}`);

await expectError(
  "client cannot insert unlock grants directly",
  () => asUser(USER_A, () => db.query(
    `insert into public.unlock_grants
       (user_id, daily_plan_id, granted_minutes, idempotency_key, expires_at)
     values ($1, $2, 999, 'forged-key-0001', now() + interval '1 day')`,
    [USER_A, planId],
  )),
  "permission denied",
);

// ---------------------------------------------------------------------------
// Consumption: serialized, capped, bound to the original request.
// ---------------------------------------------------------------------------
await asUser(USER_A, async () => {
  const first = await db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 10, 'consume-key-0001') as res",
    [grantId, deviceA],
  );
  check(
    "consume 10 of 35 minutes",
    first.rows[0].res.remainingMinutes === 25 && first.rows[0].res.idempotent === false,
    JSON.stringify(first.rows[0].res),
  );

  const replay = await db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 10, 'consume-key-0001') as res",
    [grantId, deviceA],
  );
  check(
    "consumption replay does not spend twice",
    replay.rows[0].res.remainingMinutes === 25 && replay.rows[0].res.idempotent === true,
    JSON.stringify(replay.rows[0].res),
  );
});

await expectError(
  "a consume key cannot be replayed with different minutes",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 5, 'consume-key-0001')",
    [grantId, deviceA],
  )),
  "idempotency_conflict",
);

await expectError(
  "cannot spend more than the remaining balance",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 30, 'consume-key-0002')",
    [grantId, deviceA],
  )),
  "exhausted",
);

await asUser(USER_A, async () => {
  const wallet = await db.query("select * from public.v_reward_wallet");
  const row = wallet.rows[0];
  check(
    "wallet shows 35 earned / 10 consumed / 25 remaining",
    row.earned_minutes === 35 && row.consumed_minutes === 10 && row.remaining_minutes === 25,
    JSON.stringify(row),
  );
});

// Multi-device scenario: a second active device for USER_A shares the same
// grant balance, cannot claim a second grant, and cannot replay device A's key.
let deviceA_mobile;
await asUser(USER_A, async () => {
  const dev = await db.query(
    `insert into public.devices (user_id, name, platform)
     values ($1, 'Alice Android', 'android') returning id`,
    [USER_A],
  );
  deviceA_mobile = dev.rows[0].id;

  const secondGrantAttempt = await db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-dev2-0001') as res",
    [planId, deviceA_mobile],
  );
  checkReplay(
    "second device cannot claim a duplicate grant for the same plan",
    secondGrantAttempt.rows[0].res,
    grantId,
  );
});

await expectError(
  "second device cannot replay first device's consume idempotency key",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 10, 'consume-key-0001')",
    [grantId, deviceA_mobile],
  )),
  "idempotency_conflict",
);

await asUser(USER_A, async () => {
  const dev2Spend = await db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 5, 'consume-key-dev2-0001') as res",
    [grantId, deviceA_mobile],
  );
  check(
    "second device consumes 5 minutes from shared grant (25 -> 20)",
    dev2Spend.rows[0].res.remainingMinutes === 20 && dev2Spend.rows[0].res.idempotent === false,
    JSON.stringify(dev2Spend.rows[0].res),
  );
});

await expectError(
  "first device cannot overspend after second device consumed 5 minutes",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 21, 'consume-key-dev1-over')",
    [grantId, deviceA],
  )),
  "exhausted",
);

await asUser(USER_B, async () => {
  const grants = await db.query("select count(*)::int as n from public.unlock_grants");
  const ledger = await db.query("select count(*)::int as n from public.reward_ledger");
  check(
    "RLS: user B cannot read user A rewards",
    grants.rows[0].n === 0 && ledger.rows[0].n === 0,
    `grants=${grants.rows[0].n}, ledger=${ledger.rows[0].n}`,
  );
});

await expectError(
  "user B cannot evaluate user A plan",
  () => asUser(USER_B, () => db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'eval-key-b-0001')",
    [planId, deviceA],
  )),
  "plan_not_found",
);

await expectError(
  "user B cannot consume user A grant",
  () => asUser(USER_B, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 5, 'consume-key-b-0001')",
    [grantId, deviceA],
  )),
  "forbidden",
);

// ---------------------------------------------------------------------------
// Expiry and device revocation.
// ---------------------------------------------------------------------------
await asSuperuser(async () => {
  await db.query("select set_config('focusgate.rpc', 'on', false)");
  await db.query(
    `update public.unlock_grants
     set valid_from = now() - interval '2 days', expires_at = now() - interval '1 hour'
     where id = $1`,
    [grantId],
  );
  await db.query("select set_config('focusgate.rpc', '', false)");
});

await expectError(
  "expired grant cannot be spent",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 5, 'consume-key-expired')",
    [grantId, deviceA],
  )),
  "expired",
);

let deviceA2;
let revokedSessionId;
await asUser(USER_A, async () => {
  const device = await db.query(
    `insert into public.devices (user_id, name, platform)
     values ($1, 'Alice laptop', 'web') returning id`,
    [USER_A],
  );
  deviceA2 = device.rows[0].id;
  const started = await db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-revoked', 5, 'custom'::public.focus_mode, null, null
     ) as res`,
    [deviceA2],
  );
  revokedSessionId = started.rows[0].res.sessionId;
  const revoked = await db.query("select public.rpc_revoke_device($1) as res", [deviceA2]);
  check("device revocation succeeds", revoked.rows[0].res.revoked === true);

  const session = await db.query(
    "select status from public.focus_sessions where id = $1",
    [revokedSessionId],
  );
  check("revoking a device cancels its open session", session.rows[0]?.status === "cancelled");
});

await expectError(
  "a revoked device cannot start a session",
  () => asUser(USER_A, () => db.query(
    `select public.rpc_start_focus_session(
       $1, 'client-session-revoked-2', 5, 'custom'::public.focus_mode, null, null
     )`,
    [deviceA2],
  )),
  "forbidden",
);

await expectError(
  "a revoked device cannot spend minutes",
  () => asUser(USER_A, () => db.query(
    "select public.rpc_consume_unlock_minutes($1, $2, 1, 'consume-key-revoked')",
    [grantId, deviceA2],
  )),
  "forbidden",
);

await expectError(
  "user B cannot revoke user A's device",
  () => asUser(USER_B, () => db.query("select public.rpc_revoke_device($1)", [deviceA2])),
  "forbidden",
);

// ---------------------------------------------------------------------------
// Cross-tenant constraints at the storage layer.
// ---------------------------------------------------------------------------
await asSuperuser(async () => {
  // The plan-composition guard requires the audited RPC flag; bypass it so the
  // composite foreign key itself is what rejects the cross-tenant row.
  await db.query("select set_config('focusgate.rpc', 'on', false)");
  try {
    await expectError(
      "a plan task cannot mix plans and tasks from different users",
      () => db.query(
        `insert into public.daily_plan_tasks (plan_id, task_id, user_id, kind)
         values ($1, $2, $3, 'must_do')`,
        [planId, bobTask, USER_A],
      ),
      "foreign key",
    );
  } finally {
    await db.query("select set_config('focusgate.rpc', '', false)");
  }
});

await expectError(
  "a focus session cannot reference another user's task",
  () => asSuperuser(() => db.query(
    `insert into public.focus_sessions
       (user_id, task_id, device_id, client_id, mode, planned_minutes, status, started_at)
     values ($1, $2, $3, 'cross-tenant-focus', 'custom', 5, 'running', now())`,
    [USER_A, bobTask, deviceA],
  )),
  "foreign key",
);

// A forged usage event cannot attach another user's grant.
let bobGrantId;
await asSuperuser(async () => {
  await db.query("select set_config('focusgate.rpc', 'on', false)");
  const plan = await db.query(
    `insert into public.daily_plans (user_id, plan_date, status, completed_at)
     values ($1, current_date - 3, 'completed', now()) returning id`,
    [USER_B],
  );
  const grant = await db.query(
    `insert into public.unlock_grants
       (user_id, daily_plan_id, granted_minutes, idempotency_key, expires_at)
     values ($1, $2, 10, 'bob-grant-0001', now() + interval '1 day') returning id`,
    [USER_B, plan.rows[0].id],
  );
  bobGrantId = grant.rows[0].id;
  await db.query("select set_config('focusgate.rpc', '', false)");
});

await expectError(
  "a usage event cannot reference another user's grant",
  () => asUser(USER_A, () => db.query(
    `insert into public.usage_events
       (user_id, device_id, grant_id, client_event_id, identifier, started_at)
     values ($1, $2, $3, 'forged-usage-0001', 'Discord', now())`,
    [USER_A, deviceA, bobGrantId],
  )),
  "forbidden",
);

// ---------------------------------------------------------------------------
// Structural checks.
// ---------------------------------------------------------------------------
const policyCount = await asSuperuser(async () => {
  const rows = await db.query(
    "select count(*)::int as n from pg_policies where schemaname = 'public'",
  );
  return rows.rows[0].n;
});
check("RLS policies are installed", policyCount >= 20, `policies=${policyCount}`);

const tablesWithoutRls = await asSuperuser(async () => {
  const rows = await db.query(
    `select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false
     order by c.relname`,
  );
  return rows.rows.map((r) => r.relname);
});
check(
  "every public table has RLS enabled",
  tablesWithoutRls.length === 0,
  tablesWithoutRls.join(", "),
);

const openIndex = await asSuperuser(async () => {
  const rows = await db.query(
    "select 1 from pg_indexes where schemaname = 'public' and indexname = 'ux_focus_sessions_one_open'",
  );
  return rows.rows.length;
});
check("one open session per user is enforced by a unique index", openIndex === 1);

// ---------------------------------------------------------------------------
// Milestone A1: Focus Session Integrity & Overtime Crediting Regression Suite
// (Tests A1 - A12)
// ---------------------------------------------------------------------------
const USER_FOCUS = "55555555-5555-4555-8555-555555555555";
let focusDevice;
let overtimeTask;
let overtimePlan;
let overtimePlanTask;

await asSuperuser(async () => {
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
    [USER_FOCUS, "focus-a1@example.com", '{"display_name":"Focus Tester"}'],
  );
  // Set min_valid_focus_minutes = 5 so below-minimum vs at-minimum tests are crystal clear
  await db.query(
    "update public.user_settings set min_valid_focus_minutes = 5, extra_focus_block_minutes = 50, extra_focus_reward_minutes = 5 where user_id = $1",
    [USER_FOCUS],
  );
});

await asUser(USER_FOCUS, async () => {
  const dev = await db.query(
    "insert into public.devices (user_id, name, platform) values ($1, 'Focus Workstation', 'web') returning id",
    [USER_FOCUS],
  );
  focusDevice = dev.rows[0].id;

  const t = await db.query(
    `insert into public.tasks (user_id, title, kind, required_focus_minutes, estimated_minutes)
     values ($1, 'Deep architecture spec', 'must_do', 50, 50) returning id`,
    [USER_FOCUS],
  );
  overtimeTask = t.rows[0].id;

  const p = await db.query("select public.rpc_create_daily_plan(current_date) as res");
  overtimePlan = p.rows[0].res.planId;
  const pt = await db.query(
    "select public.rpc_add_plan_task($1, $2, 'must_do'::public.task_kind) as res",
    [overtimePlan, overtimeTask],
  );
  overtimePlanTask = pt.rows[0].res.planTaskId;
  await db.query("select public.rpc_confirm_plan($1)", [overtimePlan]);
  await db.query("select public.rpc_activate_plan($1)", [overtimePlan]);
});

async function runTimedSession(clientId, plannedMinutes, elapsedMinutes, linkToTask = false) {
  let sid;
  await asUser(USER_FOCUS, async () => {
    const started = await db.query(
      `select public.rpc_start_focus_session(
         $1, $2, $3, 'pomodoro_25_5'::public.focus_mode, $4, $5
       ) as res`,
      [
        focusDevice,
        clientId,
        plannedMinutes,
        linkToTask ? overtimeTask : null,
        linkToTask ? overtimePlan : null,
      ],
    );
    sid = started.rows[0].res.sessionId;
  });

  await asSuperuser(() =>
    db.query(
      `update public.focus_sessions
       set started_at = now() - ($2::text || ' minutes')::interval - interval '5 seconds'
       where id = $1`,
      [sid, elapsedMinutes],
    ),
  );

  let completionRes;
  await asUser(USER_FOCUS, async () => {
    const completed = await db.query(
      "select public.rpc_complete_focus_session($1) as res",
      [sid],
    );
    completionRes = completed.rows[0].res;
  });
  return { sessionId: sid, ...completionRes };
}

// A1. Session below minimum duration (3m < 5m min_valid): invalid, 0 credited.
const resA1 = await runTimedSession("a1-below-min-001", 25, 3, true);
check(
  "A1: session below minimum duration (3m < 5m) is invalid and credits 0m",
  resA1.isValid === false && resA1.actualMinutes === 3 && resA1.creditedMinutes === 0,
  JSON.stringify(resA1),
);

// A2. Session at exact minimum duration (5m == 5m min_valid): valid, 5m credited.
const resA2 = await runTimedSession("a2-exact-min-001", 25, 5, false);
check(
  "A2: session at exact minimum duration (5m) is valid and credits 5m",
  resA2.isValid === true && resA2.actualMinutes === 5 && resA2.creditedMinutes === 5,
  JSON.stringify(resA2),
);

// A3. Session at exact planned duration (25m / 25m): valid, 25m credited.
const resA3 = await runTimedSession("a3-exact-planned-001", 25, 25, false);
check(
  "A3: session at exact planned duration (25m) is valid and credits 25m",
  resA3.isValid === true && resA3.actualMinutes === 25 && resA3.creditedMinutes === 25,
  JSON.stringify(resA3),
);

// A4. Session over planned duration but under 2x (40m / 25m): valid, 40m credited.
const resA4 = await runTimedSession("a4-overtime-under-2x", 25, 40, false);
check(
  "A4: session over planned duration but under 2x (40m / 25m) is valid and credits 40m",
  resA4.isValid === true && resA4.actualMinutes === 40 && resA4.creditedMinutes === 40,
  JSON.stringify(resA4),
);

// A5. Session at exact 2x planned duration (50m / 25m): valid, 50m credited.
const resA5 = await runTimedSession("a5-exact-2x-001", 25, 50, false);
check(
  "A5: session at exact 2x planned duration (50m / 25m) is valid and credits 50m",
  resA5.isValid === true && resA5.actualMinutes === 50 && resA5.creditedMinutes === 50,
  JSON.stringify(resA5),
);

// A6 & A7. Session exceeding 2x planned duration (56m on a 25m Pomodoro, and 90m on a 25m Pomodoro):
// MUST NOT be invalidated; raw actual_minutes is preserved (56m / 90m) and credited_minutes is capped at 50m!
const resA7 = await runTimedSession("a7-overtime-56m-pomodoro", 25, 56, true);
check(
  "A6/A7: 56m actual on 25m planned session stays VALID, preserves actualMinutes=56, and caps creditedMinutes=50",
  resA7.isValid === true && resA7.actualMinutes === 56 && resA7.creditedMinutes === 50,
  JSON.stringify(resA7),
);

const resA6_90 = await runTimedSession("a6-overtime-90m-pomodoro", 25, 90, true);
check(
  "A6: 90m actual on 25m planned session stays VALID, preserves actualMinutes=90, and caps creditedMinutes=50",
  resA6_90.isValid === true && resA6_90.actualMinutes === 90 && resA6_90.creditedMinutes === 50,
  JSON.stringify(resA6_90),
);

// A8. Session without valid planned duration (<= 0 or > 600) is rejected by validation rules.
await expectError(
  "A8: starting a session with planned_minutes = 0 is rejected",
  () =>
    asUser(USER_FOCUS, () =>
      db.query(
        "select public.rpc_start_focus_session($1, 'a8-zero-planned', 0, 'custom'::public.focus_mode, null, null)",
        [focusDevice],
      ),
    ),
  "planned minutes",
);
await expectError(
  "A8: starting a session with planned_minutes = 601 is rejected",
  () =>
    asUser(USER_FOCUS, () =>
      db.query(
        "select public.rpc_start_focus_session($1, 'a8-over-planned', 601, 'custom'::public.focus_mode, null, null)",
        [focusDevice],
      ),
    ),
  "planned minutes",
);

// A9. Duplicate completion request is idempotent and does not add progress twice.
await asUser(USER_FOCUS, async () => {
  const replay1 = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [resA7.sessionId],
  );
  const replay2 = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [resA7.sessionId],
  );
  check(
    "A9: duplicate completion request returns idempotent=true with identical creditedMinutes=50",
    replay1.rows[0].res.idempotent === true &&
      replay2.rows[0].res.idempotent === true &&
      replay1.rows[0].res.creditedMinutes === 50,
    JSON.stringify(replay1.rows[0].res),
  );

  // Verify v_plan_progress sums credited_minutes (50 + 50 = 100), NOT actual_minutes (56 + 90 = 146)
  // and ignores the invalid 3m session (resA1).
  const prog = await db.query(
    "select must_do_focus_done, must_do_focus_required from public.v_plan_progress where plan_id = $1",
    [overtimePlan],
  );
  check(
    "A9/A10: plan progress sums credited_minutes (50 + 50 = 100), not raw actual_minutes (56 + 90 = 146)",
    prog.rows[0]?.must_do_focus_done === 100 && prog.rows[0]?.must_do_focus_required === 50,
    JSON.stringify(prog.rows[0]),
  );
});

// A10 & A12. Reward calculation uses verified credited focus minutes (100m done - 50m required = 50m extra -> +5m extraFocus reward, NOT 146m - 50m = 96m)
// and two submissions of the same evaluation do not create two ledger entries.
await asUser(USER_FOCUS, async () => {
  const taskComp = await db.query(
    "select public.rpc_complete_plan_task($1) as res",
    [overtimePlanTask],
  );
  check(
    "A10: rpc_complete_plan_task verifies credited_minutes (100m)",
    taskComp.rows[0].res.completed === true && taskComp.rows[0].res.focusMinutes === 100,
    JSON.stringify(taskComp.rows[0].res),
  );

  await db.query("select public.rpc_complete_plan($1)", [overtimePlan]);

  const eval1 = await db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'a10-eval-key-0001') as res",
    [overtimePlan, focusDevice],
  );
  const eval2 = await db.query(
    "select public.rpc_evaluate_unlock($1, $2, 'a10-eval-key-0001') as res",
    [overtimePlan, focusDevice],
  );

  // 100m credited - 50m required = 50m extra focus = 1 block of 50m = +5m extraFocus (30 base + 5 extra = 35m).
  check(
    "A10: reward calculation uses credited_minutes (30 base + 5 extra = 35m)",
    eval1.rows[0].res.grantedMinutes === 35 &&
      eval1.rows[0].res.breakdown.extraFocus === 5,
    JSON.stringify(eval1.rows[0].res),
  );

  const ledgerCount = await db.query(
    "select count(*)::int as n from public.reward_ledger where user_id = $1",
    [USER_FOCUS],
  );
  check(
    "A12: duplicate reward submission does not create two ledger entries",
    eval2.rows[0].res.idempotent === true && ledgerCount.rows[0].n === 1,
    `ledgerCount=${ledgerCount.rows[0].n}`,
  );
});

// A11. Historical invalid sessions are NOT retroactively turned valid by migration backfill logic.
await asSuperuser(async () => {
  // Check the earlier short/invalid session from USER_A and USER_FOCUS
  const invalidRows = await db.query(
    `select count(*)::int as bad
     from public.focus_sessions
     where is_valid = false and credited_minutes <> 0`,
  );
  check(
    "A11: invalid sessions always have credited_minutes = 0 and historical invalid rows remain invalid",
    invalidRows.rows[0].bad === 0 && resA1.isValid === false,
    `badRows=${invalidRows.rows[0].bad}`,
  );
});

// ---------------------------------------------------------------------------
// Milestone A1.1: Minimum-Valid-Duration Snapshot & Credit-Cap Guard Suite
// (Tests B.1 - B.10 in PostgreSQL/PGlite)
// ---------------------------------------------------------------------------
const USER_A11 = "66666666-6666-4666-8666-666666666666";
let deviceA11;

await asSuperuser(async () => {
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
    [USER_A11, "focus-a1-1@example.com", '{"display_name":"Snapshot Tester"}'],
  );
});

await asUser(USER_A11, async () => {
  const dev = await db.query(
    "insert into public.devices (user_id, name, platform) values ($1, 'Snapshot PC', 'web') returning id",
    [USER_A11],
  );
  deviceA11 = dev.rows[0].id;
});

async function setMinValidSetting(userId, minValid) {
  await asSuperuser(() =>
    db.query("update public.user_settings set min_valid_focus_minutes = $2 where user_id = $1", [
      userId,
      minValid,
    ]),
  );
}

// 1. plannedMinutes = 25, minValidMinutes = 5 -> accepted (max credit 50 >= 5)
await setMinValidSetting(USER_A11, 5);
await asUser(USER_A11, async () => {
  const started = await db.query(
    "select public.rpc_start_focus_session($1, 'a11-case-1-25-5', 25, 'pomodoro_25_5'::public.focus_mode, null, null) as res",
    [deviceA11],
  );
  const res = started.rows[0].res;
  check(
    "A1.1-B1: plannedMinutes=25, minValidMinutes=5 is accepted and snapshots minValidMinutes=5",
    res.status === "running" && res.plannedMinutes === 25 && res.minValidMinutes === 5,
    JSON.stringify(res),
  );
  await db.query("select public.rpc_cancel_focus_session($1)", [res.sessionId]);
});

// 2. plannedMinutes = 25, minValidMinutes = 50 -> accepted (max credit 50 >= 50)
await setMinValidSetting(USER_A11, 50);
await asUser(USER_A11, async () => {
  const started = await db.query(
    "select public.rpc_start_focus_session($1, 'a11-case-2-25-50', 25, 'pomodoro_25_5'::public.focus_mode, null, null) as res",
    [deviceA11],
  );
  const res = started.rows[0].res;
  check(
    "A1.1-B2: plannedMinutes=25, minValidMinutes=50 is accepted (boundary 2*25 == 50) and snapshots minValidMinutes=50",
    res.status === "running" && res.plannedMinutes === 25 && res.minValidMinutes === 50,
    JSON.stringify(res),
  );
  await db.query("select public.rpc_cancel_focus_session($1)", [res.sessionId]);
});

// 3. plannedMinutes = 25, minValidMinutes = 51 -> rejected (max credit 50 < 51)
await setMinValidSetting(USER_A11, 51);
await expectError(
  "A1.1-B3: plannedMinutes=25, minValidMinutes=51 is rejected with invalid_input",
  () =>
    asUser(USER_A11, () =>
      db.query(
        "select public.rpc_start_focus_session($1, 'a11-case-3-25-51', 25, 'pomodoro_25_5'::public.focus_mode, null, null)",
        [deviceA11],
      ),
    ),
  "invalid_input",
);

// 4. plannedMinutes = 30, minValidMinutes = 60 -> accepted (max credit 60 >= 60)
await setMinValidSetting(USER_A11, 60);
await asUser(USER_A11, async () => {
  const started = await db.query(
    "select public.rpc_start_focus_session($1, 'a11-case-4-30-60', 30, 'custom'::public.focus_mode, null, null) as res",
    [deviceA11],
  );
  const res = started.rows[0].res;
  check(
    "A1.1-B4: plannedMinutes=30, minValidMinutes=60 is accepted and snapshots minValidMinutes=60",
    res.status === "running" && res.plannedMinutes === 30 && res.minValidMinutes === 60,
    JSON.stringify(res),
  );
  await db.query("select public.rpc_cancel_focus_session($1)", [res.sessionId]);
});

// 5. plannedMinutes = 50, minValidMinutes = 120 -> rejected (max credit 100 < 120)
await setMinValidSetting(USER_A11, 120);
await expectError(
  "A1.1-B5: plannedMinutes=50, minValidMinutes=120 is rejected with invalid_input",
  () =>
    asUser(USER_A11, () =>
      db.query(
        "select public.rpc_start_focus_session($1, 'a11-case-5-50-120', 50, 'pomodoro_50_10'::public.focus_mode, null, null)",
        [deviceA11],
      ),
    ),
  "invalid_input",
);

// 6. Active session retains its original minimum threshold after user_settings.min_valid_focus_minutes changes!
await setMinValidSetting(USER_A11, 15);
let snapSessionId;
await asUser(USER_A11, async () => {
  const started = await db.query(
    "select public.rpc_start_focus_session($1, 'a11-case-6-snapshot', 25, 'pomodoro_25_5'::public.focus_mode, null, null) as res",
    [deviceA11],
  );
  snapSessionId = started.rows[0].res.sessionId;
});

// While session is running, user settings change to 60 minutes!
await setMinValidSetting(USER_A11, 60);

// Move session clock to 20 minutes (which satisfies the snapshotted 15m threshold, even though current setting is 60m)
await asSuperuser(() =>
  db.query(
    "update public.focus_sessions set started_at = now() - interval '20 minutes 10 seconds' where id = $1",
    [snapSessionId],
  ),
);

await asUser(USER_A11, async () => {
  const completed = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [snapSessionId],
  );
  const res = completed.rows[0].res;
  check(
    "A1.1-B6: active session validates against its snapshotted minValidMinutes=15 (not the mid-session 60m setting change)",
    res.isValid === true &&
      res.minValidMinutes === 15 &&
      res.actualMinutes === 20 &&
      res.creditedMinutes === 20,
    JSON.stringify(res),
  );
});

// 7. A session below its stored minimum receives 0 credit even if user_settings is lowered mid-session.
await setMinValidSetting(USER_A11, 20);
let belowSnapSessionId;
await asUser(USER_A11, async () => {
  const started = await db.query(
    "select public.rpc_start_focus_session($1, 'a11-case-7-below-snap', 25, 'pomodoro_25_5'::public.focus_mode, null, null) as res",
    [deviceA11],
  );
  belowSnapSessionId = started.rows[0].res.sessionId;
});

// Lower user setting to 5m mid-session; session must STILL require its snapshotted 20m!
await setMinValidSetting(USER_A11, 5);
await asSuperuser(() =>
  db.query(
    "update public.focus_sessions set started_at = now() - interval '12 minutes 10 seconds' where id = $1",
    [belowSnapSessionId],
  ),
);

await asUser(USER_A11, async () => {
  const completed = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [belowSnapSessionId],
  );
  const res = completed.rows[0].res;
  check(
    "A1.1-B7: session at 12m below its snapshotted 20m threshold is invalid and receives 0 credit despite setting lowered to 5m",
    res.isValid === false &&
      res.minValidMinutes === 20 &&
      res.actualMinutes === 12 &&
      res.creditedMinutes === 0,
    JSON.stringify(res),
  );
});

// 10. Legacy session with impossible min_valid_minutes > planned_minutes * 2 cannot be marked valid on completion.
let legacyImpossibleId;
await asSuperuser(async () => {
  const inserted = await db.query(
    `insert into public.focus_sessions
       (user_id, device_id, client_id, mode, planned_minutes, min_valid_minutes, status, started_at)
     values ($1, $2, 'a11-case-10-legacy-impossible', 'custom', 25, 60, 'running', now() - interval '65 minutes')
     returning id`,
    [USER_A11, deviceA11],
  );
  legacyImpossibleId = inserted.rows[0].id;
});

await asUser(USER_A11, async () => {
  const completed = await db.query(
    "select public.rpc_complete_focus_session($1) as res",
    [legacyImpossibleId],
  );
  const res = completed.rows[0].res;
  check(
    "A1.1-B10: legacy session with min_valid_minutes (60) > 2*planned_minutes (50) is safely marked invalid with 0 credit",
    res.isValid === false && res.creditedMinutes === 0 && res.actualMinutes === 65,
    JSON.stringify(res),
  );
});

await db.close();

console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
