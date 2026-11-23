import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  getSupabaseContext,
  getSupabaseUserTimezone,
  localDateInTimezone,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import type { DayPoint, Statistics } from "./types";

interface DayRow {
  day: string;
  focus: number;
  tasks: number;
  entertainment_seconds: number;
}

function buildDayKeys(timezone: string, period: number): string[] {
  const todayStr = localDateInTimezone(timezone);
  const anchor = new Date(`${todayStr}T12:00:00Z`).getTime();
  const keys: string[] = [];
  for (let i = period - 1; i >= 0; i -= 1) {
    keys.push(new Date(anchor - i * 86_400_000).toISOString().slice(0, 10));
  }
  return keys;
}

export async function getStatistics(periodDays: number): Promise<Statistics> {
  const period = [7, 30, 90].includes(periodDays) ? periodDays : 7;

  const ctx = await getSupabaseContext();
  if (ctx) {
    const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
    const dayKeys = buildDayKeys(timezone, period);
    const startDayKey = dayKeys[0]!;
    // Fetch slightly wider window (-1 day) in UTC so timezone offsets are covered cleanly.
    const cutoffIso = new Date(
      new Date(`${startDayKey}T00:00:00Z`).getTime() - 86_400_000,
    ).toISOString();

    const [focusRes, taskRes, usageRes] = await Promise.all([
      ctx.supabase
        .from("focus_sessions")
        .select("started_at, credited_minutes, is_valid")
        .eq("user_id", ctx.userId)
        .eq("status", "completed")
        .gte("started_at", cutoffIso),
      ctx.supabase
        .from("tasks")
        .select("status, completed_at")
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress", "completed"]),
      ctx.supabase
        .from("usage_events")
        .select("started_at, duration_seconds, was_blocked")
        .eq("user_id", ctx.userId)
        .gte("started_at", cutoffIso),
    ]);

    const focusRows = unwrapSupabase(focusRes) as Array<{
      started_at: string;
      credited_minutes: number;
      is_valid: boolean;
    }>;
    const taskRows = unwrapSupabase(taskRes) as Array<{
      status: string;
      completed_at: string | null;
    }>;
    const usageRows = unwrapSupabase(usageRes) as Array<{
      started_at: string;
      duration_seconds: number;
      was_blocked: boolean;
    }>;

    const dayMap = new Map<string, { focus: number; tasks: number; usageSeconds: number }>();
    for (const key of dayKeys) {
      dayMap.set(key, { focus: 0, tasks: 0, usageSeconds: 0 });
    }

    let focusMinutes = 0;
    let sessionCount = 0;
    let validCount = 0;
    for (const row of focusRows) {
      const day = localDateInTimezone(timezone, new Date(row.started_at));
      if (day < startDayKey) continue;
      sessionCount += 1;
      if (row.is_valid) {
        validCount += 1;
        focusMinutes += row.credited_minutes;
        const bucket = dayMap.get(day);
        if (bucket) bucket.focus += row.credited_minutes;
      }
    }

    let completedTasks = 0;
    let openTasks = 0;
    for (const row of taskRows) {
      if (row.status === "todo" || row.status === "in_progress") {
        openTasks += 1;
      } else if (row.status === "completed" && row.completed_at) {
        const day = localDateInTimezone(timezone, new Date(row.completed_at));
        if (day >= startDayKey) {
          completedTasks += 1;
          const bucket = dayMap.get(day);
          if (bucket) bucket.tasks += 1;
        }
      }
    }

    let entertainmentSeconds = 0;
    let blockedAttempts = 0;
    for (const row of usageRows) {
      const day = localDateInTimezone(timezone, new Date(row.started_at));
      if (day < startDayKey) continue;
      if (row.was_blocked) blockedAttempts += 1;
      entertainmentSeconds += row.duration_seconds;
      const bucket = dayMap.get(day);
      if (bucket) bucket.usageSeconds += row.duration_seconds;
    }

    const days: DayPoint[] = dayKeys.map((key) => {
      const bucket = dayMap.get(key) ?? { focus: 0, tasks: 0, usageSeconds: 0 };
      return {
        date: key,
        label: new Intl.DateTimeFormat("en-GB", {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        }).format(new Date(`${key}T12:00:00Z`)),
        focusMinutes: bucket.focus,
        tasksCompleted: bucket.tasks,
        entertainmentMinutes: Math.round(bucket.usageSeconds / 60),
      };
    });

    const totalDecided = completedTasks + openTasks;
    const bestDay = days.reduce<DayPoint | null>((best, day) => {
      if (!best || day.focusMinutes > best.focusMinutes) return day;
      return best;
    }, null);

    return {
      days,
      periodDays: period,
      focusMinutes,
      sessionCount,
      tasksCompleted: completedTasks,
      openTasks,
      completionRate: totalDecided > 0 ? Math.round((completedTasks / totalDecided) * 100) : 0,
      entertainmentMinutes: Math.round(entertainmentSeconds / 60),
      blockedAttempts,
      validRate: sessionCount > 0 ? Math.round((validCount / sessionCount) * 100) : 0,
      bestDay: bestDay && bestDay.focusMinutes > 0 ? bestDay : null,
    };
  }

  return withUser(async (db) => {
    const timezoneResult = await db.query<{ timezone: string }>(
      "select timezone from public.profiles where id = $1",
      [LOCAL_USER_ID],
    );
    const timezone = timezoneResult.rows[0]?.timezone ?? "UTC";

    const daysResult = await db.query<DayRow>(
      `with days as (
         select generate_series(
           (now() at time zone $2)::date - ($3::int - 1),
           (now() at time zone $2)::date,
           interval '1 day'
         )::date as day
       ),
       focus as (
         select (started_at at time zone $2)::date as day,
                coalesce(sum(credited_minutes), 0)::int as minutes
         from public.focus_sessions
         where user_id = $1 and status = 'completed' and is_valid
         group by 1
       ),
       completed as (
         select (completed_at at time zone $2)::date as day, count(*)::int as tasks
         from public.tasks
         where user_id = $1 and status = 'completed' and completed_at is not null
         group by 1
       ),
       usage as (
         select (started_at at time zone $2)::date as day,
                coalesce(sum(duration_seconds), 0)::int as seconds
         from public.usage_events
         where user_id = $1
         group by 1
       )
       select to_char(d.day, 'YYYY-MM-DD') as day,
              coalesce(f.minutes, 0)::int as focus,
              coalesce(c.tasks, 0)::int as tasks,
              coalesce(u.seconds, 0)::int as entertainment_seconds
       from days d
       left join focus f on f.day = d.day
       left join completed c on c.day = d.day
       left join usage u on u.day = d.day
       order by d.day`,
      [LOCAL_USER_ID, timezone, period],
    );

    const summaryResult = await db.query<{
      focus_minutes: number;
      session_count: number;
      valid_count: number;
      completed_tasks: number;
      open_tasks: number;
      entertainment_seconds: number;
    }>(
      `select
         coalesce((
           select sum(credited_minutes) from public.focus_sessions
           where user_id = $1 and status = 'completed' and is_valid
             and (started_at at time zone $2)::date >= (now() at time zone $2)::date - ($3::int - 1)
         ), 0)::int as focus_minutes,
         coalesce((
           select count(*) from public.focus_sessions
           where user_id = $1 and status = 'completed'
             and (started_at at time zone $2)::date >= (now() at time zone $2)::date - ($3::int - 1)
         ), 0)::int as session_count,
         coalesce((
           select count(*) from public.focus_sessions
           where user_id = $1 and status = 'completed' and is_valid
             and (started_at at time zone $2)::date >= (now() at time zone $2)::date - ($3::int - 1)
         ), 0)::int as valid_count,
         coalesce((
           select count(*) from public.tasks
           where user_id = $1 and status = 'completed'
             and (completed_at at time zone $2)::date >= (now() at time zone $2)::date - ($3::int - 1)
         ), 0)::int as completed_tasks,
         (select count(*) from public.tasks where user_id = $1 and status in ('todo','in_progress'))::int as open_tasks,
         coalesce((
           select sum(duration_seconds) from public.usage_events
           where user_id = $1
             and (started_at at time zone $2)::date >= (now() at time zone $2)::date - ($3::int - 1)
         ), 0)::int as entertainment_seconds`,
      [LOCAL_USER_ID, timezone, period],
    );

    const summary = summaryResult.rows[0];

    const days: DayPoint[] = daysResult.rows.map((row) => ({
      date: row.day,
      label: new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      }).format(new Date(`${row.day}T12:00:00Z`)),
      focusMinutes: row.focus,
      tasksCompleted: row.tasks,
      entertainmentMinutes: Math.round(row.entertainment_seconds / 60),
    }));

    const totalDecided = (summary?.completed_tasks ?? 0) + (summary?.open_tasks ?? 0);
    const bestDay = days.reduce<DayPoint | null>((best, day) => {
      if (!best || day.focusMinutes > best.focusMinutes) return day;
      return best;
    }, null);

    return {
      days,
      periodDays: period,
      focusMinutes: summary?.focus_minutes ?? 0,
      sessionCount: summary?.session_count ?? 0,
      tasksCompleted: summary?.completed_tasks ?? 0,
      openTasks: summary?.open_tasks ?? 0,
      completionRate:
        totalDecided > 0 ? Math.round(((summary?.completed_tasks ?? 0) / totalDecided) * 100) : 0,
      entertainmentMinutes: Math.round((summary?.entertainment_seconds ?? 0) / 60),
      validRate:
        (summary?.session_count ?? 0) > 0
          ? Math.round(((summary?.valid_count ?? 0) / (summary?.session_count ?? 1)) * 100)
          : 0,
      bestDay: bestDay && bestDay.focusMinutes > 0 ? bestDay : null,
    };
  });
}
