import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  assertSupabaseOk,
  getSupabaseContext,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { toIso } from "./format";
import type { Grant, LedgerEntry, UsageEntry, Wallet } from "./types";
import { ensureDevice, ensureDeviceSupabase } from "./workspace";

interface GrantRow {
  id: string;
  daily_plan_id: string | null;
  granted_minutes: number;
  consumed_minutes: number;
  remaining_minutes: number;
  status: Grant["status"];
  source: string;
  expires_at: string | Date;
  created_at: string | Date;
}

interface LedgerRow {
  id: string;
  grant_id: string | null;
  delta_minutes: number;
  reason: string;
  note: string | null;
  created_at: string | Date;
}

interface UsageRow {
  id: string;
  identifier: string;
  display_name: string;
  duration_seconds: number;
  was_blocked: boolean;
  started_at: string | Date;
}

export interface EvaluateUnlockResult {
  grantId: string;
  grantedMinutes: number;
  remainingMinutes: number;
  idempotent: boolean;
  breakdown: { base: number; bonus: number; extraFocus: number; cappedAt: number };
}

export interface ConsumeResult {
  grantId: string;
  consumedMinutes: number;
  remainingMinutes: number;
  idempotent: boolean;
}

export async function getWalletSummary(): Promise<number> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("unlock_grants")
        .select("remaining_minutes")
        .eq("user_id", ctx.userId)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString()),
    ) as Array<{ remaining_minutes: number }>;
    return rows.reduce((sum, row) => sum + (row.remaining_minutes ?? 0), 0);
  }

  return withUser(async (db) => {
    const result = await db.query<{ remaining: number }>(
      `select coalesce(sum(remaining_minutes) filter (
                where status = 'active' and expires_at > now()
              ), 0)::int as remaining
       from public.unlock_grants where user_id = $1`,
      [LOCAL_USER_ID],
    );
    return result.rows[0]?.remaining ?? 0;
  });
}

function buildWalletPayload(
  grantRows: GrantRow[],
  ledgerRows: LedgerRow[],
  usageRows: UsageRow[],
): Wallet {
  const grants: Grant[] = grantRows.map((row) => ({
    id: row.id,
    dailyPlanId: row.daily_plan_id,
    grantedMinutes: row.granted_minutes,
    consumedMinutes: row.consumed_minutes,
    remainingMinutes: row.remaining_minutes,
    status: row.status,
    source: row.source,
    expiresAt: toIso(row.expires_at) ?? new Date().toISOString(),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  }));

  const ledger: LedgerEntry[] = ledgerRows.map((row) => ({
    id: row.id,
    grantId: row.grant_id,
    deltaMinutes: row.delta_minutes,
    reason: row.reason,
    note: row.note,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  }));

  const usage: UsageEntry[] = usageRows.map((row) => ({
    id: row.id,
    identifier: row.identifier,
    displayName: row.display_name,
    durationSeconds: row.duration_seconds,
    wasBlocked: row.was_blocked,
    startedAt: toIso(row.started_at) ?? new Date().toISOString(),
  }));

  const availableMinutes = grants
    .filter((grant) => grant.status === "active" && new Date(grant.expiresAt) > new Date())
    .reduce((sum, grant) => sum + grant.remainingMinutes, 0);

  return {
    availableMinutes,
    earnedMinutes: grants.reduce((sum, grant) => sum + grant.grantedMinutes, 0),
    consumedMinutes: grants.reduce((sum, grant) => sum + grant.consumedMinutes, 0),
    grants,
    ledger,
    usage,
  };
}

export async function getWallet(): Promise<Wallet> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const [grantsRes, ledgerRes, usageRes] = await Promise.all([
      ctx.supabase
        .from("unlock_grants")
        .select(
          "id, daily_plan_id, granted_minutes, consumed_minutes, remaining_minutes, status, source, expires_at, created_at",
        )
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(20),
      ctx.supabase
        .from("reward_ledger")
        .select("id, grant_id, delta_minutes, reason, note, created_at")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(25),
      ctx.supabase
        .from("usage_events")
        .select("id, identifier, display_name, duration_seconds, was_blocked, started_at")
        .eq("user_id", ctx.userId)
        .order("started_at", { ascending: false })
        .limit(15),
    ]);

    return buildWalletPayload(
      unwrapSupabase(grantsRes) as GrantRow[],
      unwrapSupabase(ledgerRes) as LedgerRow[],
      unwrapSupabase(usageRes) as UsageRow[],
    );
  }

  return withUser(async (db) => {
    const grantsResult = await db.query<GrantRow>(
      `select id, daily_plan_id, granted_minutes, consumed_minutes, remaining_minutes, status,
              source, expires_at, created_at
       from public.unlock_grants where user_id = $1
       order by created_at desc limit 20`,
      [LOCAL_USER_ID],
    );
    const ledgerResult = await db.query<LedgerRow>(
      `select id, grant_id, delta_minutes, reason, note, created_at
       from public.reward_ledger where user_id = $1
       order by created_at desc limit 25`,
      [LOCAL_USER_ID],
    );
    const usageResult = await db.query<UsageRow>(
      `select id, identifier, display_name, duration_seconds, was_blocked, started_at
       from public.usage_events where user_id = $1
       order by started_at desc limit 15`,
      [LOCAL_USER_ID],
    );

    const grants: Grant[] = grantsResult.rows.map((row) => ({
      id: row.id,
      dailyPlanId: row.daily_plan_id,
      grantedMinutes: row.granted_minutes,
      consumedMinutes: row.consumed_minutes,
      remainingMinutes: row.remaining_minutes,
      status: row.status,
      source: row.source,
      expiresAt: toIso(row.expires_at) ?? new Date().toISOString(),
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));

    const ledger: LedgerEntry[] = ledgerResult.rows.map((row) => ({
      id: row.id,
      grantId: row.grant_id,
      deltaMinutes: row.delta_minutes,
      reason: row.reason,
      note: row.note,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));

    const usage: UsageEntry[] = usageResult.rows.map((row) => ({
      id: row.id,
      identifier: row.identifier,
      displayName: row.display_name,
      durationSeconds: row.duration_seconds,
      wasBlocked: row.was_blocked,
      startedAt: toIso(row.started_at) ?? new Date().toISOString(),
    }));

    const availableMinutes = grants
      .filter((grant) => grant.status === "active" && new Date(grant.expiresAt) > new Date())
      .reduce((sum, grant) => sum + grant.remainingMinutes, 0);

    return {
      availableMinutes,
      earnedMinutes: grants.reduce((sum, grant) => sum + grant.grantedMinutes, 0),
      consumedMinutes: grants.reduce((sum, grant) => sum + grant.consumedMinutes, 0),
      grants,
      ledger,
      usage,
    };
  });
}

export async function getRecentLedger(limit = 6): Promise<LedgerEntry[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("reward_ledger")
        .select("id, grant_id, delta_minutes, reason, note, created_at")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(limit),
    ) as LedgerRow[];
    return rows.map((row) => ({
      id: row.id,
      grantId: row.grant_id,
      deltaMinutes: row.delta_minutes,
      reason: row.reason,
      note: row.note,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));
  }

  return withUser(async (db) => {
    const result = await db.query<LedgerRow>(
      `select id, grant_id, delta_minutes, reason, note, created_at
       from public.reward_ledger where user_id = $1
       order by created_at desc limit $2`,
      [LOCAL_USER_ID, limit],
    );
    return result.rows.map((row) => ({
      id: row.id,
      grantId: row.grant_id,
      deltaMinutes: row.delta_minutes,
      reason: row.reason,
      note: row.note,
      createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    }));
  });
}

export async function claimDailyReward(planId: string): Promise<EvaluateUnlockResult> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const device = await ensureDeviceSupabase(ctx.supabase, ctx.userId);
    return unwrapSupabase(
      await ctx.supabase.rpc("rpc_evaluate_unlock", {
        p_plan_id: planId,
        p_device_id: device.id,
        p_idempotency_key: `web-${crypto.randomUUID()}`,
      }),
      "The reward could not be evaluated.",
    ) as EvaluateUnlockResult;
  }

  return withUser(async (db) => {
    const device = await ensureDevice(db);
    const result = await db.query<{ result: EvaluateUnlockResult }>(
      "select public.rpc_evaluate_unlock($1, $2, $3) as result",
      [planId, device.id, `web-${crypto.randomUUID()}`],
    );
    const payload = result.rows[0]?.result;
    if (!payload) throw new Error("The reward could not be evaluated.");
    return payload;
  });
}

export async function spendUnlockMinutes(input: {
  grantId: string;
  minutes: number;
  label: string;
}): Promise<ConsumeResult> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const device = await ensureDeviceSupabase(ctx.supabase, ctx.userId);
    const payload = unwrapSupabase(
      await ctx.supabase.rpc("rpc_consume_unlock_minutes", {
        p_grant_id: input.grantId,
        p_device_id: device.id,
        p_minutes: input.minutes,
        p_idempotency_key: `web-${crypto.randomUUID()}`,
      }),
      "The unlock minutes could not be spent.",
    ) as ConsumeResult;

    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - input.minutes * 60_000);
    assertSupabaseOk(
      await ctx.supabase.from("usage_events").insert({
        user_id: ctx.userId,
        device_id: device.id,
        grant_id: input.grantId,
        client_event_id: `web-usage-${crypto.randomUUID()}`,
        identifier: input.label,
        display_name: input.label,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_seconds: input.minutes * 60,
        was_blocked: false,
      }),
    );

    return payload;
  }

  return withUser(async (db) => {
    const device = await ensureDevice(db);
    const result = await db.query<{ result: ConsumeResult }>(
      "select public.rpc_consume_unlock_minutes($1, $2, $3, $4) as result",
      [input.grantId, device.id, input.minutes, `web-${crypto.randomUUID()}`],
    );
    const payload = result.rows[0]?.result;
    if (!payload) throw new Error("The unlock minutes could not be spent.");

    await db.query(
      `insert into public.usage_events
        (user_id, device_id, grant_id, client_event_id, identifier, display_name,
         started_at, ended_at, duration_seconds, was_blocked)
       values ($1, $2, $3, $4, $5, $5,
               now() - make_interval(mins => $6), now(), $6 * 60, false)`,
      [
        LOCAL_USER_ID,
        device.id,
        input.grantId,
        `web-usage-${crypto.randomUUID()}`,
        input.label,
        input.minutes,
      ],
    );

    return payload;
  });
}
