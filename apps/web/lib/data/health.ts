import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { getSupabaseContext, localDateInTimezone } from "@/lib/supabase/data-client";

export interface DailyHealthMetric {
  date: string;
  steps: number;
  sleepMinutes: number;
  avgHeartRate: number | null;
  activeCalories: number;
  weightKg: number | null;
  source: string;
  syncedAt: string;
}

export interface HealthPeriodAggregate {
  key: string;
  label: string;
  daysLogged: number;
  totalSteps: number;
  avgSteps: number;
  avgCalories: number;
  avgSleepMinutes: number;
  avgWeightKg: number | null;
}

export interface HealthComparison {
  current: HealthPeriodAggregate;
  previous: HealthPeriodAggregate | null;
  buckets: HealthPeriodAggregate[];
}

export interface HealthSummary {
  latest: DailyHealthMetric | null;
  days: DailyHealthMetric[];
  avgSteps: number;
  avgSleepMinutes: number;
  avgCalories: number;
  latestWeightKg: number | null;
  byWeek: HealthComparison;
  byMonth: HealthComparison;
  byYear: HealthComparison;
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
      weightKg?: number | null;
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
        weight_kg:
          m.weightKg !== undefined && m.weightKg !== null && m.weightKg > 0
            ? Math.round(m.weightKg * 100) / 100
            : null,
        source: m.source?.trim() || "manual",
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
           (user_id, device_id, metric_date, steps, sleep_minutes, avg_heart_rate, active_calories, weight_kg, source, synced_at)
         values ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, now())
         on conflict (user_id, metric_date)
         do update set
           steps = excluded.steps,
           sleep_minutes = excluded.sleep_minutes,
           avg_heart_rate = coalesce(excluded.avg_heart_rate, public.daily_health_metrics.avg_heart_rate),
           active_calories = excluded.active_calories,
           weight_kg = coalesce(excluded.weight_kg, public.daily_health_metrics.weight_kg),
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
          m.weightKg !== undefined && m.weightKg !== null && m.weightKg > 0
            ? Math.round(m.weightKg * 100) / 100
            : null,
          m.source?.trim() || "manual",
        ],
      );
    }
    return { status: "ok", count: input.metrics.length };
  });
}

export async function getHealthSummary(
  _periodDays: number,
  timezone = "UTC",
): Promise<HealthSummary> {
  const todayStr = localDateInTimezone(timezone);
  const startDate = new Date(
    new Date(`${todayStr}T12:00:00Z`).getTime() - 730 * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("daily_health_metrics")
        .select("*")
        .eq("user_id", ctx.userId)
        .gte("metric_date", startDate)
        .order("metric_date", { ascending: false });
      if (error) {
        console.error("[health] getHealthSummary failed:", error.message);
        return buildSummary([], todayStr);
      }
      const days: DailyHealthMetric[] = (data ?? []).map((r) => ({
        date: String(r.metric_date),
        steps: Number(r.steps ?? 0),
        sleepMinutes: Number(r.sleep_minutes ?? 0),
        avgHeartRate:
          r.avg_heart_rate !== null && r.avg_heart_rate !== undefined
            ? Number(r.avg_heart_rate)
            : null,
        activeCalories: Number(r.active_calories ?? 0),
        weightKg:
          r.weight_kg !== null && r.weight_kg !== undefined ? Number(r.weight_kg) : null,
        source: String(r.source ?? "manual"),
        syncedAt: String(r.synced_at ?? new Date().toISOString()),
      }));
      return buildSummary(days, todayStr);
    } catch (err) {
      console.error("[health] getHealthSummary exception:", err);
      return buildSummary([], todayStr);
    }
  }

  return withUser(async (db) => {
    const res = await db.query<{
      metric_date: string | Date;
      steps: number;
      sleep_minutes: number;
      avg_heart_rate: number | null;
      active_calories: number;
      weight_kg: string | number | null;
      source: string;
      synced_at: string | Date;
    }>(
      `select metric_date, steps, sleep_minutes, avg_heart_rate, active_calories, weight_kg, source, synced_at
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
      weightKg:
        r.weight_kg !== null && r.weight_kg !== undefined ? Number(r.weight_kg) : null,
      source: r.source,
      syncedAt:
        r.synced_at instanceof Date ? r.synced_at.toISOString() : String(r.synced_at),
    }));
    return buildSummary(days, todayStr);
  });
}

function aggregateBucket(
  key: string,
  label: string,
  rows: ReadonlyArray<DailyHealthMetric>,
): HealthPeriodAggregate {
  if (rows.length === 0) {
    return {
      key,
      label,
      daysLogged: 0,
      totalSteps: 0,
      avgSteps: 0,
      avgCalories: 0,
      avgSleepMinutes: 0,
      avgWeightKg: null,
    };
  }
  const totalSteps = rows.reduce((s, d) => s + d.steps, 0);
  const avgSteps = Math.round(totalSteps / rows.length);
  const avgCalories = Math.round(
    rows.reduce((s, d) => s + d.activeCalories, 0) / rows.length,
  );
  const sleepRows = rows.filter((d) => d.sleepMinutes > 0);
  const avgSleepMinutes =
    sleepRows.length > 0
      ? Math.round(sleepRows.reduce((s, d) => s + d.sleepMinutes, 0) / sleepRows.length)
      : 0;
  const weightRows = rows.filter((d) => d.weightKg !== null);
  const avgWeightKg =
    weightRows.length > 0
      ? Math.round(
          (weightRows.reduce((s, d) => s + (d.weightKg ?? 0), 0) / weightRows.length) * 10,
        ) / 10
      : null;

  return {
    key,
    label,
    daysLogged: rows.length,
    totalSteps,
    avgSteps,
    avgCalories,
    avgSleepMinutes,
    avgWeightKg,
  };
}

function isoWeekKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 7);
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function buildComparison(
  days: ReadonlyArray<DailyHealthMetric>,
  keyFn: (dateStr: string) => string,
  labelFn: (key: string) => string,
  currentKey: string,
): HealthComparison {
  const groups = new Map<string, DailyHealthMetric[]>();
  for (const d of days) {
    const k = keyFn(d.date);
    const list = groups.get(k);
    if (list) list.push(d);
    else groups.set(k, [d]);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
  const buckets = sortedKeys.map((k) => aggregateBucket(k, labelFn(k), groups.get(k)!));
  const current =
    buckets.find((b) => b.key === currentKey) ??
    buckets[0] ??
    aggregateBucket(currentKey, labelFn(currentKey), []);
  const curIdx = buckets.findIndex((b) => b.key === current.key);
  const previous = curIdx >= 0 && curIdx + 1 < buckets.length ? buckets[curIdx + 1]! : null;
  return { current, previous, buckets };
}

function buildSummary(days: DailyHealthMetric[], todayStr: string): HealthSummary {
  const overall = aggregateBucket("all", "All", days);
  const latestWeightKg = days.find((d) => d.weightKg !== null)?.weightKg ?? null;

  return {
    latest: days[0] ?? null,
    days,
    avgSteps: overall.avgSteps,
    avgSleepMinutes: overall.avgSleepMinutes,
    avgCalories: overall.avgCalories,
    latestWeightKg,
    byWeek: buildComparison(
      days,
      isoWeekKey,
      (k) => k,
      isoWeekKey(todayStr),
    ),
    byMonth: buildComparison(
      days,
      (d) => d.slice(0, 7),
      (k) => k,
      todayStr.slice(0, 7),
    ),
    byYear: buildComparison(
      days,
      (d) => d.slice(0, 4),
      (k) => k,
      todayStr.slice(0, 4),
    ),
  };
}
