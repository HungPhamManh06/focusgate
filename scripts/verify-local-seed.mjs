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
  `select count(*)::int as n, coalesce(sum(actual_minutes) filter (where is_valid), 0)::int as minutes
   from public.focus_sessions where user_id = $1`,
  [USER],
);
check("focus sessions valid", sessions.rows[0].n === 6 && sessions.rows[0].minutes > 100, JSON.stringify(sessions.rows[0]));

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
