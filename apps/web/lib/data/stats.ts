import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import type { DayPoint, Statistics } from "./types";

interface DayRow {
  day: string;
  focus: number;
  tasks: number;
  entertainment_seconds: number;
}

export async function getStatistics(periodDays: number): Promise<Statistics> {
  const period = [7, 30, 90].includes(periodDays) ? periodDays : 7;

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
