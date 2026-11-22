import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { applyLocalMigrations } from "../lib/db/migrations.ts";
import { computeAgentPolicySnapshot } from "../lib/domain/agent-policy.ts";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
const BOOTSTRAP_SQL = path.join(process.cwd(), "lib", "db", "local", "bootstrap.sql");
const SEED_SQL = path.join(process.cwd(), "lib", "db", "local", "seed.sql");
const SEED_USER = "9f8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

async function asSeedUser<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [SEED_USER]);
    await db.exec("set local role authenticated");
    const res = await fn();
    await db.exec("commit");
    return res;
  } catch (err) {
    await db.exec("rollback").catch(() => undefined);
    throw err;
  }
}

test("Device sync lifecycle: register -> block_rules -> policy snapshot -> idempotent usage_events -> revoke", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile(BOOTSTRAP_SQL, "utf8"));
    await applyLocalMigrations(db, MIGRATIONS_DIR);
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values ($1, 'alex@focusgate.local', '{"display_name":"Alex"}'::jsonb)
       on conflict (id) do nothing`,
      [SEED_USER],
    );
    await db.exec(await readFile(SEED_SQL, "utf8"));

    // 1. Register a Windows device as the authenticated user
    const deviceId = await asSeedUser(db, async () => {
      const inserted = await db.query<{ id: string }>(
        `insert into public.devices (user_id, name, platform, app_version, last_seen_at)
         values ($1, 'Work Laptop', 'windows', '0.1.0', now())
         returning id`,
        [SEED_USER],
      );
      return inserted.rows[0]!.id;
    });

    // 2. Add block & allow rules for the device
    await asSeedUser(db, async () => {
      await db.query(
        `insert into public.block_rules
           (user_id, device_id, platform, rule_type, identifier, display_name, category, action)
         values
           ($1, $2, 'windows', 'block', 'steam.exe', 'Steam', 'games', 'overlay'),
           ($1, $2, 'windows', 'allow', 'code.exe', 'VS Code', 'other', 'notify')`,
        [SEED_USER, deviceId],
      );
    });

    // 3. Pull policy snapshot (seed.sql has an active grant -> lockActive = false)
    const pullSnapshot = () =>
      asSeedUser(db, async () => {
        const grantsRes = await db.query<{ remaining: number }>(
          `select coalesce(sum(remaining_minutes), 0)::int as remaining
           from public.unlock_grants
           where user_id = $1 and status = 'active' and expires_at > now() and remaining_minutes > 0`,
          [SEED_USER],
        );
        const rulesRes = await db.query<{
          rule_type: "block" | "allow";
          identifier: string;
          is_enabled: boolean;
        }>(
          `select rule_type, identifier, is_enabled
           from public.block_rules
           where user_id = $1 and device_id = $2
           order by identifier asc`,
          [SEED_USER, deviceId],
        );
        return computeAgentPolicySnapshot({
          activeGrantMinutes: grantsRes.rows[0]?.remaining ?? 0,
          rules: rulesRes.rows.map((r) => ({
            ruleType: r.rule_type,
            identifier: r.identifier,
            isEnabled: r.is_enabled,
          })),
        });
      });

    const unlockedPolicy = await pullSnapshot();
    assert.equal(unlockedPolicy.lockActive, false);
    assert.deepEqual(unlockedPolicy.blockedProcesses, ["steam.exe"]);
    assert.deepEqual(unlockedPolicy.allowedProcesses, ["code.exe"]);

    // Exhaust active grants via rpc_consume_unlock_minutes -> lockActive becomes true
    await asSeedUser(db, async () => {
      const grants = await db.query<{ id: string; remaining_minutes: number }>(
        `select id, remaining_minutes
         from public.unlock_grants
         where user_id = $1 and status = 'active' and remaining_minutes > 0`,
        [SEED_USER],
      );
      for (const g of grants.rows) {
        await db.query(
          "select public.rpc_consume_unlock_minutes($1, $2, $3, $4)",
          [g.id, deviceId, g.remaining_minutes, `exhaust-grant-${g.id}`],
        );
      }
    });
    const lockedPolicy = await pullSnapshot();
    assert.equal(lockedPolicy.lockActive, true);

    // 4. Ingest usage events idempotently (replay does not duplicate)
    const ingestOnce = () =>
      asSeedUser(db, async () => {
        const res = await db.query<{ id: string }>(
          `insert into public.usage_events
             (user_id, device_id, client_event_id, identifier, display_name, started_at, duration_seconds, was_blocked)
           values
             ($1, $2, 'evt-sync-0001', 'steam.exe', 'Steam', now() - interval '1 minute', 60, true)
           on conflict (device_id, client_event_id) do nothing
           returning id`,
          [SEED_USER, deviceId],
        );
        return res.rows.length;
      });

    assert.equal(await ingestOnce(), 1);
    assert.equal(await ingestOnce(), 0);

    // 5. Revoke device and verify status becomes 'revoked'
    const revokeRes = await asSeedUser(db, async () => {
      const res = await db.query<{ result: { revoked: boolean } }>(
        "select public.rpc_revoke_device($1) as result",
        [deviceId],
      );
      return res.rows[0]!.result;
    });
    assert.equal(revokeRes.revoked, true);

    const statusAfter = await asSeedUser(db, async () => {
      const res = await db.query<{ status: string }>(
        "select status from public.devices where id = $1",
        [deviceId],
      );
      return res.rows[0]?.status;
    });
    assert.equal(statusAfter, "revoked");
  } finally {
    await db.close();
  }
});
