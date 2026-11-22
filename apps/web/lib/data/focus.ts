import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
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
    isValid: row.is_valid,
  };
}

const SESSION_SELECT = `
  select fs.id, fs.task_id, t.title as task_title, fs.daily_plan_id, fs.mode,
         fs.planned_minutes, fs.min_valid_minutes, fs.actual_minutes, fs.credited_minutes,
         fs.status, fs.started_at, fs.ended_at, fs.is_valid
  from public.focus_sessions fs
  left join public.tasks t on t.id = fs.task_id
`;

export async function getActiveSession(): Promise<FocusSession | null> {
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

export async function getFocusCandidates(): Promise<FocusCandidate[]> {
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
  await withUser(async (db) => {
    await db.query("select public.rpc_cancel_focus_session($1)", [sessionId]);
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
