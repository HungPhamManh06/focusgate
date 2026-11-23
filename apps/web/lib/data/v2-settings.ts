import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  assertSupabaseOk,
  getSupabaseContext,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { toIso } from "./format";

export interface V2Settings {
  earnedMinutesBalance: number;
  streakFreezeCount: number;
  frozenDates: string[];
  unlockPassUntil: string | null;
  whitelistFocusMode: boolean;
  allowedApps: string[];
  allowedDomains: string[];
  blockedDomains: string[];
  weekdayBedtimeStart: string | null;
  weekdayBedtimeEnd: string | null;
  weekendBedtimeStart: string | null;
  weekendBedtimeEnd: string | null;
  weekendRelaxedMode: boolean;
  lastDailyReviewDate: string | null;
}

export interface DiscoveredAppRecord {
  id: string;
  deviceId: string;
  identifier: string;
  displayName: string;
  platform: string;
  lastSeenAt: string;
}

const DEFAULT_BLOCKED_DOMAINS = [
  "youtube.com",
  "facebook.com",
  "tiktok.com",
  "instagram.com",
  "reddit.com",
];

function mapSettingsRow(row: Record<string, unknown> | null | undefined): V2Settings {
  const r = row ?? {};
  return {
    earnedMinutesBalance: Number(r.earned_minutes_balance ?? 0),
    streakFreezeCount: Number(r.streak_freeze_count ?? 0),
    frozenDates: Array.isArray(r.frozen_dates) ? (r.frozen_dates as string[]) : [],
    unlockPassUntil: toIso((r.unlock_pass_until as string | Date | null | undefined) ?? null),
    whitelistFocusMode: Boolean(r.whitelist_focus_mode ?? false),
    allowedApps: Array.isArray(r.allowed_apps) ? (r.allowed_apps as string[]) : [],
    allowedDomains: Array.isArray(r.allowed_domains) ? (r.allowed_domains as string[]) : [],
    blockedDomains: Array.isArray(r.blocked_domains)
      ? (r.blocked_domains as string[])
      : DEFAULT_BLOCKED_DOMAINS,
    weekdayBedtimeStart: (r.weekday_bedtime_start as string | null | undefined) ?? "23:00",
    weekdayBedtimeEnd: (r.weekday_bedtime_end as string | null | undefined) ?? "06:00",
    weekendBedtimeStart: (r.weekend_bedtime_start as string | null | undefined) ?? "00:00",
    weekendBedtimeEnd: (r.weekend_bedtime_end as string | null | undefined) ?? "07:00",
    weekendRelaxedMode: Boolean(r.weekend_relaxed_mode ?? false),
    lastDailyReviewDate: (r.last_daily_review_date as string | null | undefined) ?? null,
  };
}

export async function getV2Settings(request?: Request): Promise<V2Settings> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { data, error } = await ctx.supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return mapSettingsRow(data as Record<string, unknown> | null);
  }

  return withUser(async (db) => {
    const res = await db.query<Record<string, unknown>>(
      "select * from public.user_settings where user_id = $1 limit 1",
      [LOCAL_USER_ID],
    );
    return mapSettingsRow(res.rows[0]);
  });
}

export async function updateV2Settings(
  input: Partial<{
    whitelistFocusMode: boolean;
    allowedApps: string[];
    allowedDomains: string[];
    blockedDomains: string[];
    weekdayBedtimeStart: string | null;
    weekdayBedtimeEnd: string | null;
    weekendBedtimeStart: string | null;
    weekendBedtimeEnd: string | null;
    weekendRelaxedMode: boolean;
    lastDailyReviewDate: string | null;
  }>,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.whitelistFocusMode !== undefined) patch.whitelist_focus_mode = input.whitelistFocusMode;
  if (input.allowedApps !== undefined) patch.allowed_apps = input.allowedApps;
  if (input.allowedDomains !== undefined) patch.allowed_domains = input.allowedDomains;
  if (input.blockedDomains !== undefined) patch.blocked_domains = input.blockedDomains;
  if (input.weekdayBedtimeStart !== undefined) patch.weekday_bedtime_start = input.weekdayBedtimeStart;
  if (input.weekdayBedtimeEnd !== undefined) patch.weekday_bedtime_end = input.weekdayBedtimeEnd;
  if (input.weekendBedtimeStart !== undefined) patch.weekend_bedtime_start = input.weekendBedtimeStart;
  if (input.weekendBedtimeEnd !== undefined) patch.weekend_bedtime_end = input.weekendBedtimeEnd;
  if (input.weekendRelaxedMode !== undefined) patch.weekend_relaxed_mode = input.weekendRelaxedMode;
  if (input.lastDailyReviewDate !== undefined) patch.last_daily_review_date = input.lastDailyReviewDate;

  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase
        .from("user_settings")
        .upsert({ user_id: ctx.userId, ...patch }, { onConflict: "user_id" }),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `insert into public.user_settings (user_id) values ($1) on conflict (user_id) do nothing`,
      [LOCAL_USER_ID],
    );
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(patch)) {
      if (k === "updated_at") continue;
      sets.push(`${k} = $${idx++}`);
      values.push(v);
    }
    if (sets.length === 0) return;
    values.push(LOCAL_USER_ID);
    await db.query(
      `update public.user_settings set ${sets.join(", ")}, updated_at = now() where user_id = $${idx}`,
      values,
    );
  });
}

export async function grantEarnedTime(
  minutes: number,
  reason = "task_completed",
  request?: Request,
): Promise<{ earnedMinutesBalance: number }> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const data = unwrapSupabase(
      await ctx.supabase.rpc("rpc_grant_earned_time", {
        p_minutes: minutes,
        p_reason: reason,
      }),
    ) as { earnedMinutesBalance: number };
    return data;
  }

  return withUser(async (db) => {
    const res = await db.query<{ result: { earnedMinutesBalance: number } }>(
      "select public.rpc_grant_earned_time($1, $2) as result",
      [minutes, reason],
    );
    return res.rows[0]!.result;
  });
}

export async function activateUnlockPass(
  minutes = 10,
  request?: Request,
): Promise<{ consumedMinutes: number; earnedMinutesBalance: number; unlockPassUntil: string }> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const data = unwrapSupabase(
      await ctx.supabase.rpc("rpc_activate_unlock_pass", {
        p_minutes: minutes,
      }),
    ) as { consumedMinutes: number; earnedMinutesBalance: number; unlockPassUntil: string };
    return data;
  }

  return withUser(async (db) => {
    const res = await db.query<{
      result: { consumedMinutes: number; earnedMinutesBalance: number; unlockPassUntil: string };
    }>("select public.rpc_activate_unlock_pass($1) as result", [minutes]);
    return res.rows[0]!.result;
  });
}

export async function buyStreakFreeze(): Promise<{
  earnedMinutesBalance: number;
  streakFreezeCount: number;
}> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    return unwrapSupabase(await ctx.supabase.rpc("rpc_buy_streak_freeze")) as {
      earnedMinutesBalance: number;
      streakFreezeCount: number;
    };
  }

  return withUser(async (db) => {
    const res = await db.query<{
      result: { earnedMinutesBalance: number; streakFreezeCount: number };
    }>("select public.rpc_buy_streak_freeze() as result");
    return res.rows[0]!.result;
  });
}

export async function useStreakFreeze(
  day: string,
): Promise<{ streakFreezeCount: number; frozenDates: string[] }> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    return unwrapSupabase(
      await ctx.supabase.rpc("rpc_use_streak_freeze", { p_day: day }),
    ) as { streakFreezeCount: number; frozenDates: string[] };
  }

  return withUser(async (db) => {
    const res = await db.query<{
      result: { streakFreezeCount: number; frozenDates: string[] };
    }>("select public.rpc_use_streak_freeze($1) as result", [day]);
    return res.rows[0]!.result;
  });
}

export async function rolloverIncompleteTasks(
  fromDate: string,
  toDate: string,
): Promise<{ moved: number }> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    return unwrapSupabase(
      await ctx.supabase.rpc("rpc_rollover_incomplete_tasks", {
        p_from_date: fromDate,
        p_to_date: toDate,
      }),
    ) as { moved: number };
  }

  return withUser(async (db) => {
    const res = await db.query<{ result: { moved: number } }>(
      "select public.rpc_rollover_incomplete_tasks($1::date, $2::date) as result",
      [fromDate, toDate],
    );
    return res.rows[0]!.result;
  });
}

export async function upsertDiscoveredApps(
  input: {
    deviceId: string;
    platform: string;
    apps: ReadonlyArray<{ identifier: string; displayName: string }>;
  },
  request?: Request,
): Promise<{ status: "ok"; count: number } | { status: "forbidden" }> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { data: dev, error: devErr } = await ctx.supabase
      .from("devices")
      .select("status")
      .eq("id", input.deviceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (devErr) throw new Error(devErr.message);
    if (!dev || dev.status !== "active") return { status: "forbidden" };

    if (input.apps.length > 0) {
      const now = new Date().toISOString();
      const rows = input.apps.map((app) => ({
        user_id: ctx.userId,
        device_id: input.deviceId,
        identifier: app.identifier.trim().slice(0, 180),
        display_name: app.displayName.trim().slice(0, 180) || app.identifier.trim(),
        platform: input.platform,
        last_seen_at: now,
      }));
      assertSupabaseOk(
        await ctx.supabase
          .from("device_discovered_apps")
          .upsert(rows, { onConflict: "device_id,identifier" }),
      );
    }
    return { status: "ok", count: input.apps.length };
  }

  return withUser(async (db) => {
    const devRes = await db.query<{ status: string }>(
      "select status from public.devices where id = $1 and user_id = $2 limit 1",
      [input.deviceId, LOCAL_USER_ID],
    );
    if (!devRes.rows[0] || devRes.rows[0].status !== "active") {
      return { status: "forbidden" };
    }
    for (const app of input.apps) {
      await db.query(
        `insert into public.device_discovered_apps
           (user_id, device_id, identifier, display_name, platform, last_seen_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (device_id, identifier)
         do update set display_name = excluded.display_name, last_seen_at = now()`,
        [
          LOCAL_USER_ID,
          input.deviceId,
          app.identifier.trim().slice(0, 180),
          app.displayName.trim().slice(0, 180) || app.identifier.trim(),
          input.platform,
        ],
      );
    }
    return { status: "ok", count: input.apps.length };
  });
}

export async function listDiscoveredApps(): Promise<DiscoveredAppRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("device_discovered_apps")
        .select("id, device_id, identifier, display_name, platform, last_seen_at")
        .eq("user_id", ctx.userId)
        .order("display_name", { ascending: true })
        .limit(150),
    ) as Array<{
      id: string;
      device_id: string;
      identifier: string;
      display_name: string;
      platform: string;
      last_seen_at: string;
    }>;
    return rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      identifier: r.identifier,
      displayName: r.display_name,
      platform: r.platform,
      lastSeenAt: toIso(r.last_seen_at) ?? new Date().toISOString(),
    }));
  }

  return withUser(async (db) => {
    const res = await db.query<{
      id: string;
      device_id: string;
      identifier: string;
      display_name: string;
      platform: string;
      last_seen_at: string | Date;
    }>(
      `select id, device_id, identifier, display_name, platform, last_seen_at
       from public.device_discovered_apps
       where user_id = $1
       order by display_name asc
       limit 150`,
      [LOCAL_USER_ID],
    );
    return res.rows.map((r) => ({
      id: r.id,
      deviceId: r.device_id,
      identifier: r.identifier,
      displayName: r.display_name,
      platform: r.platform,
      lastSeenAt: toIso(r.last_seen_at) ?? new Date().toISOString(),
    }));
  });
}
