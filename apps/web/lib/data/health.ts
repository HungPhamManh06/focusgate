import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { getSupabaseContext, localDateInTimezone } from "@/lib/supabase/data-client";

export interface DailyHealthMetric {
  date: string;
  steps: number;
  sleepMinutes: number;
  avgHeartRate: number | null;
  activeCalories: number;
  source: string;
  syncedAt: string;
}

export interface HealthSummary {
  latest: DailyHealthMetric | null;
  days: DailyHealthMetric[];
  avgSteps: number;
  avgSleepMinutes: number;
}

export async function upsertDailyHealthMetrics(
  input: {
    deviceId?: string | null;
    metrics: ReadonlyArray<{
      date: string;
      steps: number;
      sleepMinutes: number;
      avgHeartRate?: number | null;
      activeCalories: number;
      source?: string;
    }>;
  },
  request?: Request,
): Promise<{ status: "ok"; count: number } | { status: "forbidden" }> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    if (input.deviceId) {
      const { data: dev, error: devErr } = await ctx.supabase
        .from("devices")
        .select("status")
        .eq("id", input.deviceId)
        .eq("user_id", ctx.userId)
        .maybeSingle();
      if (devErr) throw new Error(devErr.message);
      if (!dev || dev.status !== "active") return { status: "forbidden" };
    }

    if (input.metrics.length > 0) {
      const now = new Date().toISOString();
      const rows = input.metrics.map((m) => ({
        user_id: ctx.userId,
        device_id: input.deviceId ?? null,
        metric_date: m.date,
        steps: Math.max(0, Math.round(m.steps)),
        sleep_minutes: Math.max(0, Math.round(m.sleepMinutes)),
        avg_heart_rate:
          m.avgHeartRate !== undefined && m.avgHeartRate !== null
            ? Math.max(30, Math.min(240, Math.round(m.avgHeartRate)))
            : null,
        active_calories: Math.max(0, Math.round(m.activeCalories)),
        source: m.source?.trim() || "health_connect",
        synced_at: now,
      }));
      const { error } = await ctx.supabase
        .from("daily_health_metrics")
        .upsert(rows, { onConflict: "user_id,metric_date" });
      if (error) throw new Error(error.message);
    }

    return { status: "ok", count: input.metrics.length };
  }

  return withUser(async (db) => {
    for (const m of input.metrics) {
      await db.query(
        `insert into public.daily_health_metrics
           (user_id, device_id, metric_date, steps, sleep_minutes, avg_heart_rate, active_calories, source, synced_at)
         values ($1, $2, $3::date, $4, $5, $6, $7, $8, now())
         on conflict (user_id, metric_date)
         do update set
           steps = excluded.steps,
           sleep_minutes = excluded.sleep_minutes,
           avg_heart_rate = excluded.avg_heart_rate,
           active_calories = excluded.active_calories,
           source = excluded.source,
           synced_at = now()`,
        [
          LOCAL_USER_ID,
          input.deviceId ?? null,
          m.date,
          Math.max(0, Math.round(m.steps)),
          Math.max(0, Math.round(m.sleepMinutes)),
          m.avgHeartRate ?? null,
          Math.max(0, Math.round(m.activeCalories)),
          m.source?.trim() || "health_connect",
        ],
      );
    }
    return { status: "ok", count: input.metrics.length };
  });
}

export async function getHealthSummary(
  periodDays: number,
  timezone = "UTC",
): Promise<HealthSummary> {
  const todayStr = localDateInTimezone(timezone);
  const startDate = new Date(
    new Date(`${todayStr}T12:00:00Z`).getTime() - (periodDays - 1) * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("daily_health_metrics")
        .select("metric_date, steps, sleep_minutes, avg_heart_rate, active_calories, source, synced_at")
        .eq("user_id", ctx.userId)
        .gte("metric_date", startDate)
        .order("metric_date", { ascending: false });
      if (error) {
        console.error("[health] getHealthSummary failed:", error.message);
        return { latest: null, days: [], avgSteps: 0, avgSleepMinutes: 0 };
      }
      const days: DailyHealthMetric[] = (data ?? []).map((r) => ({
        date: String(r.metric_date),
        steps: Number(r.steps ?? 0),
        sleepMinutes: Number(r.sleep_minutes ?? 0),
        avgHeartRate: r.avg_heart_rate !== null ? Number(r.avg_heart_rate) : null,
        activeCalories: Number(r.active_calories ?? 0),
        source: String(r.source ?? "health_connect"),
        syncedAt: String(r.synced_at ?? new Date().toISOString()),
      }));
      return buildSummary(days);
    } catch (err) {
      console.error("[health] getHealthSummary exception:", err);
      return { latest: null, days: [], avgSteps: 0, avgSleepMinutes: 0 };
    }
  }

  return withUser(async (db) => {
    const res = await db.query<{
      metric_date: string | Date;
      steps: number;
      sleep_minutes: number;
      avg_heart_rate: number | null;
      active_calories: number;
      source: string;
      synced_at: string | Date;
    }>(
      `select metric_date, steps, sleep_minutes, avg_heart_rate, active_calories, source, synced_at
       from public.daily_health_metrics
       where user_id = $1 and metric_date >= $2::date
       order by metric_date desc`,
      [LOCAL_USER_ID, startDate],
    );
    const days: DailyHealthMetric[] = res.rows.map((r) => ({
      date:
        r.metric_date instanceof Date
          ? r.metric_date.toISOString().slice(0, 10)
          : String(r.metric_date).slice(0, 10),
      steps: Number(r.steps ?? 0),
      sleepMinutes: Number(r.sleep_minutes ?? 0),
      avgHeartRate: r.avg_heart_rate !== null ? Number(r.avg_heart_rate) : null,
      activeCalories: Number(r.active_calories ?? 0),
      source: r.source,
      syncedAt:
        r.synced_at instanceof Date ? r.synced_at.toISOString() : String(r.synced_at),
    }));
    return buildSummary(days);
  });
}

function buildSummary(days: DailyHealthMetric[]): HealthSummary {
  if (days.length === 0) {
    return { latest: null, days: [], avgSteps: 0, avgSleepMinutes: 0 };
  }
  const avgSteps = Math.round(days.reduce((s, d) => s + d.steps, 0) / days.length);
  const sleepDays = days.filter((d) => d.sleepMinutes > 0);
  const avgSleepMinutes =
    sleepDays.length > 0
      ? Math.round(sleepDays.reduce((s, d) => s + d.sleepMinutes, 0) / sleepDays.length)
      : 0;
  return {
    latest: days[0] ?? null,
    days,
    avgSteps,
    avgSleepMinutes,
  };
}
