import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  assertSupabaseOk,
  getSupabaseContext,
  getSupabaseUserTimezone,
  localDateInTimezone,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { toIso } from "./format";
import type { FocusMode, FocusSession } from "./types";

export interface FocusCandidate {
  id: string;
  title: string;
  kind: "must_do" | "should_do" | "bonus";
  requiredFocusMinutes: number;
  inTodayPlan: boolean;
}

export interface FocusSummary {
  minutes: number;
  sessions: number;
  validSessions: number;
}

interface SessionRow {
  id: string;
  task_id: string | null;
  task_title: string | null;
  daily_plan_id: string | null;
  mode: FocusMode;
  planned_minutes: number;
  min_valid_minutes: number;
  actual_minutes: number;
  credited_minutes: number;
  status: FocusSession["status"];
  started_at: string | Date;
  ended_at: string | Date | null;
  paused_at: string | Date | null;
  paused_seconds: number | null;
  interruption_count: number | null;
  is_valid: boolean;
}

function mapSession(row: SessionRow): FocusSession {
  return {
    id: row.id,
    taskId: row.task_id,
    taskTitle: row.task_title,
    planId: row.daily_plan_id,
    mode: row.mode,
    plannedMinutes: row.planned_minutes,
    minValidMinutes: Math.max(1, row.min_valid_minutes ?? 1),
    actualMinutes: row.actual_minutes,
    creditedMinutes: row.credited_minutes ?? (row.is_valid ? Math.min(row.actual_minutes, row.planned_minutes * 2) : 0),
    status: row.status,
    startedAt: toIso(row.started_at) ?? new Date().toISOString(),
    endedAt: toIso(row.ended_at),
    pausedAt: toIso(row.paused_at),
    pausedSeconds: Math.max(0, row.paused_seconds ?? 0),
    interruptionCount: Math.max(0, row.interruption_count ?? 0),
    isValid: row.is_valid,
  };
}

const SESSION_SELECT = `
  select fs.id, fs.task_id, t.title as task_title, fs.daily_plan_id, fs.mode,
         fs.planned_minutes, fs.min_valid_minutes, fs.actual_minutes, fs.credited_minutes,
         fs.status, fs.started_at, fs.ended_at, fs.paused_at, fs.paused_seconds,
         fs.interruption_count, fs.is_valid
  from public.focus_sessions fs
  left join public.tasks t on t.id = fs.task_id
`;

const SUPABASE_SESSION_SELECT =
  "id, task_id, daily_plan_id, mode, planned_minutes, min_valid_minutes, actual_minutes, credited_minutes, status, started_at, ended_at, paused_at, paused_seconds, interruption_count, is_valid, tasks(title)";

type SupabaseSessionRow = Omit<SessionRow, "task_title"> & {
  tasks?: { title: string } | Array<{ title: string }> | null;
};

function mapSupabaseSession(row: SupabaseSessionRow): FocusSession {
  const taskTitle = Array.isArray(row.tasks)
    ? (row.tasks[0]?.title ?? null)
    : (row.tasks?.title ?? null);
  return mapSession({ ...row, task_title: taskTitle });
}

export async function getActiveSession(): Promise<FocusSession | null> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("focus_sessions")
        .select(SUPABASE_SESSION_SELECT)
        .eq("user_id", ctx.userId)
        .in("status", ["running", "paused"])
        .order("started_at", { ascending: false })
        .limit(1),
    ) as SupabaseSessionRow[];
    return rows[0] ? mapSupabaseSession(rows[0]) : null;
  }

  return withUser(async (db) => {
    const result = await db.query<SessionRow>(
      `${SESSION_SELECT}
       where fs.user_id = $1 and fs.status in ('running', 'paused')
       order by fs.started_at desc limit 1`,
      [LOCAL_USER_ID],
    );
    return result.rows[0] ? mapSession(result.rows[0]) : null;
  });
}

export async function getTodaySessions(limit = 12): Promise<FocusSession[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
    const today = localDateInTimezone(timezone);
    const cutoffIso = new Date(Date.now() - 48 * 3600_000).toISOString();
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("focus_sessions")
        .select(SUPABASE_SESSION_SELECT)
        .eq("user_id", ctx.userId)
        .gte("started_at", cutoffIso)
        .order("started_at", { ascending: false }),
    ) as SupabaseSessionRow[];

    return rows
      .filter((row) => localDateInTimezone(timezone, new Date(row.started_at)) === today)
      .slice(0, limit)
      .map(mapSupabaseSession);
  }

  return withUser(async (db) => {
    const result = await db.query<SessionRow>(
      `${SESSION_SELECT}
       where fs.user_id = $1
         and (fs.started_at at time zone (select timezone from public.profiles where id = $1))::date
             = (now() at time zone (select timezone from public.profiles where id = $1))::date
       order by fs.started_at desc
       limit $2`,
      [LOCAL_USER_ID, limit],
    );
    return result.rows.map(mapSession);
  });
}

export async function getRecentSessions(limit = 6): Promise<FocusSession[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("focus_sessions")
        .select(SUPABASE_SESSION_SELECT)
        .eq("user_id", ctx.userId)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(limit),
    ) as SupabaseSessionRow[];
    return rows.map(mapSupabaseSession);
  }

  return withUser(async (db) => {
    const result = await db.query<SessionRow>(
      `${SESSION_SELECT}
       where fs.user_id = $1 and fs.status = 'completed'
       order by fs.started_at desc limit $2`,
      [LOCAL_USER_ID, limit],
    );
    return result.rows.map(mapSession);
  });
}

export async function getTodayFocusSummary(): Promise<FocusSummary> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
    const today = localDateInTimezone(timezone);
    const cutoffIso = new Date(Date.now() - 48 * 3600_000).toISOString();
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("focus_sessions")
        .select("started_at, credited_minutes, is_valid")
        .eq("user_id", ctx.userId)
        .eq("status", "completed")
        .gte("started_at", cutoffIso),
    ) as Array<{ started_at: string; credited_minutes: number; is_valid: boolean }>;

    let minutes = 0;
    let sessions = 0;
    let validSessions = 0;
    for (const row of rows) {
      if (localDateInTimezone(timezone, new Date(row.started_at)) !== today) continue;
      sessions += 1;
      if (row.is_valid) {
        validSessions += 1;
        minutes += row.credited_minutes;
      }
    }
    return { minutes, sessions, validSessions };
  }

  return withUser(async (db) => {
    const result = await db.query<{ minutes: number; sessions: number; valid: number }>(
      `select coalesce(sum(credited_minutes) filter (where is_valid), 0)::int as minutes,
              count(*)::int as sessions,
              count(*) filter (where is_valid)::int as valid
       from public.focus_sessions
       where user_id = $1 and status = 'completed'
         and (started_at at time zone (select timezone from public.profiles where id = $1))::date
             = (now() at time zone (select timezone from public.profiles where id = $1))::date`,
      [LOCAL_USER_ID],
    );
    const row = result.rows[0];
    return { minutes: row?.minutes ?? 0, sessions: row?.sessions ?? 0, validSessions: row?.valid ?? 0 };
  });
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function getFocusCandidates(): Promise<FocusCandidate[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
    const today = localDateInTimezone(timezone);
    const [taskRes, todayPlanRes] = await Promise.all([
      ctx.supabase
        .from("tasks")
        .select("id, title, kind, priority, required_focus_minutes, created_at")
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress"]),
      ctx.supabase
        .from("daily_plan_tasks")
        .select("task_id, daily_plans!inner(plan_date)")
        .eq("user_id", ctx.userId)
        .eq("daily_plans.plan_date", today),
    ]);
    const taskRows = unwrapSupabase(taskRes) as Array<{
      id: string;
      title: string;
      kind: FocusCandidate["kind"];
      priority: string;
      required_focus_minutes: number;
      created_at: string;
    }>;
    const todayPlanRows = unwrapSupabase(todayPlanRes) as Array<{ task_id: string }>;

    const todayTaskIds = new Set(todayPlanRows.map((row) => row.task_id));
    return taskRows
      .map((row) => ({
        id: row.id,
        title: row.title,
        kind: row.kind,
        requiredFocusMinutes: row.required_focus_minutes,
        inTodayPlan: todayTaskIds.has(row.id),
        _priority: PRIORITY_ORDER[row.priority] ?? 3,
        _createdAt: row.created_at,
      }))
      .sort((a, b) => {
        if (a.inTodayPlan !== b.inTodayPlan) return a.inTodayPlan ? -1 : 1;
        if (a._priority !== b._priority) return a._priority - b._priority;
        return b._createdAt.localeCompare(a._createdAt);
      })
      .slice(0, 30)
      .map(({ id, title, kind, requiredFocusMinutes, inTodayPlan }) => ({
        id,
        title,
        kind,
        requiredFocusMinutes,
        inTodayPlan,
      }));
  }

  return withUser(async (db) => {
    const result = await db.query<{
      id: string;
      title: string;
      kind: FocusCandidate["kind"];
      required_focus_minutes: number;
      in_today_plan: boolean;
    }>(
      `select t.id, t.title, t.kind, t.required_focus_minutes,
              exists (
                select 1
                from public.daily_plan_tasks pt
                join public.daily_plans p on p.id = pt.plan_id
                join public.profiles pr on pr.id = p.user_id
                where pt.task_id = t.id and pt.user_id = $1
                  and p.plan_date = (now() at time zone pr.timezone)::date
              ) as in_today_plan
       from public.tasks t
       where t.user_id = $1 and t.status in ('todo', 'in_progress')
       order by in_today_plan desc,
                case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
                t.created_at desc
       limit 30`,
      [LOCAL_USER_ID],
    );

    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      requiredFocusMinutes: row.required_focus_minutes,
      inTodayPlan: row.in_today_plan,
    }));
  });
}

export async function startFocusSession(input: {
  taskId: string | null;
  mode: FocusMode;
  plannedMinutes: number;
}): Promise<{ id: string }> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const devices = unwrapSupabase(
      await ctx.supabase
        .from("devices")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1),
    ) as Array<{ id: string }>;

    if (!devices[0]) {
      throw new Error("Register an active device before starting a focus session.");
    }

    let planId: string | null = null;
    if (input.taskId) {
      const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
      const today = localDateInTimezone(timezone);
      const planTasks = unwrapSupabase(
        await ctx.supabase
          .from("daily_plan_tasks")
          .select("plan_id, daily_plans!inner(status, plan_date)")
          .eq("user_id", ctx.userId)
          .eq("task_id", input.taskId)
          .in("daily_plans.status", ["draft", "confirmed", "active"])
          .eq("daily_plans.plan_date", today)
          .limit(1),
      ) as Array<{ plan_id: string }>;
      planId = planTasks[0]?.plan_id ?? null;
    }

    const payload = unwrapSupabase(
      await ctx.supabase.rpc("rpc_start_focus_session", {
        p_device_id: devices[0].id,
        p_client_id: `web-${crypto.randomUUID()}`,
        p_planned_minutes: input.plannedMinutes,
        p_mode: input.mode,
        p_task_id: input.taskId,
        p_daily_plan_id: planId,
      }),
      "Could not start the focus session.",
    ) as { sessionId: string };

    return { id: payload.sessionId };
  }

  return withUser(async (db) => {
    const device = await db.query<{ id: string }>(
      `select id from public.devices
       where user_id = $1 and status = 'active' order by created_at limit 1`,
      [LOCAL_USER_ID],
    );
    if (!device.rows[0]) {
      throw new Error("Register an active device before starting a focus session.");
    }

    let planId: string | null = null;
    if (input.taskId) {
      const planTask = await db.query<{ plan_id: string }>(
        `select pt.plan_id
         from public.daily_plan_tasks pt
         join public.daily_plans p on p.id = pt.plan_id
         join public.profiles pr on pr.id = p.user_id
         where pt.user_id = $1 and pt.task_id = $2
           and p.status in ('draft', 'confirmed', 'active')
           and p.plan_date = (now() at time zone pr.timezone)::date
         limit 1`,
        [LOCAL_USER_ID, input.taskId],
      );
      planId = planTask.rows[0]?.plan_id ?? null;
    }

    // The server sets started_at and derives actual_minutes at completion.
    const result = await db.query<{ result: { sessionId: string } }>(
      `select public.rpc_start_focus_session(
         $1, $2, $3, $4::public.focus_mode, $5, $6
       ) as result`,
      [
        device.rows[0].id,
        `web-${crypto.randomUUID()}`,
        input.plannedMinutes,
        input.mode,
        input.taskId,
        planId,
      ],
    );
    const payload = result.rows[0]?.result;
    if (!payload) throw new Error("Could not start the focus session.");
    return { id: payload.sessionId };
  });
}

export async function cancelFocusSession(sessionId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase.rpc("rpc_cancel_focus_session", { p_session_id: sessionId }),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query("select public.rpc_cancel_focus_session($1)", [sessionId]);
  });
}

export async function pauseFocusSession(sessionId: string): Promise<{
  pausedAt: string;
  pausedSeconds: number;
}> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const payload = (
      await ctx.supabase.rpc("rpc_pause_focus_session", { p_session_id: sessionId })
    );
    assertSupabaseOk(payload);
    const data = payload.data as { pausedAt?: string; pausedSeconds?: number } | null;
    return {
      pausedAt: data?.pausedAt ?? new Date().toISOString(),
      pausedSeconds: Math.max(0, data?.pausedSeconds ?? 0),
    };
  }

  return withUser(async (db) => {
    const result = await db.query<{
      result: { pausedAt?: string; pausedSeconds?: number };
    }>("select public.rpc_pause_focus_session($1) as result", [sessionId]);
    const payload = result.rows[0]?.result;
    return {
      pausedAt: payload?.pausedAt ?? new Date().toISOString(),
      pausedSeconds: Math.max(0, payload?.pausedSeconds ?? 0),
    };
  });
}

export async function resumeFocusSession(sessionId: string): Promise<{
  pausedSeconds: number;
}> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const payload = await ctx.supabase.rpc("rpc_resume_focus_session", {
      p_session_id: sessionId,
    });
    assertSupabaseOk(payload);
    const data = payload.data as { pausedSeconds?: number } | null;
    return { pausedSeconds: Math.max(0, data?.pausedSeconds ?? 0) };
  }

  return withUser(async (db) => {
    const result = await db.query<{
      result: { pausedSeconds?: number };
    }>("select public.rpc_resume_focus_session($1) as result", [sessionId]);
    const payload = result.rows[0]?.result;
    return {
      pausedSeconds: Math.max(0, payload?.pausedSeconds ?? 0),
    };
  });
}

export async function completeFocusSession(
  sessionId: string,
): Promise<{
  sessionId: string;
  actualMinutes: number;
  creditedMinutes: number;
  plannedMinutes: number;
  minValidMinutes: number;
  isValid: boolean;
  idempotent: boolean;
}> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const payload = unwrapSupabase(
      await ctx.supabase.rpc("rpc_complete_focus_session", { p_session_id: sessionId }),
      "This session is no longer active.",
    ) as {
      sessionId: string;
      actualMinutes: number;
      creditedMinutes?: number;
      plannedMinutes?: number;
      minValidMinutes?: number;
      isValid: boolean;
      idempotent?: boolean;
    };
    const plannedMinutes = payload.plannedMinutes ?? payload.actualMinutes;
    const minValidMinutes = Math.max(1, payload.minValidMinutes ?? 1);
    const creditedMinutes =
      payload.creditedMinutes ??
      (payload.isValid ? Math.min(payload.actualMinutes, plannedMinutes * 2) : 0);
    return {
      sessionId: payload.sessionId,
      actualMinutes: payload.actualMinutes,
      creditedMinutes,
      plannedMinutes,
      minValidMinutes,
      isValid: payload.isValid,
      idempotent: Boolean(payload.idempotent),
    };
  }

  return withUser(async (db) => {
    const result = await db.query<{
      result: {
        sessionId: string;
        actualMinutes: number;
        creditedMinutes?: number;
        plannedMinutes?: number;
        minValidMinutes?: number;
        isValid: boolean;
        idempotent?: boolean;
      };
    }>("select public.rpc_complete_focus_session($1) as result", [sessionId]);
    const payload = result.rows[0]?.result;
    if (!payload) throw new Error("This session is no longer active.");
    const plannedMinutes = payload.plannedMinutes ?? payload.actualMinutes;
    const minValidMinutes = Math.max(1, payload.minValidMinutes ?? 1);
    const creditedMinutes =
      payload.creditedMinutes ??
      (payload.isValid ? Math.min(payload.actualMinutes, plannedMinutes * 2) : 0);
    return {
      sessionId: payload.sessionId,
      actualMinutes: payload.actualMinutes,
      creditedMinutes,
      plannedMinutes,
      minValidMinutes,
      isValid: payload.isValid,
      idempotent: Boolean(payload.idempotent),
    };
  });
}
