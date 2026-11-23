import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { getSupabaseContext } from "@/lib/supabase/data-client";

export interface GoalRecord {
  id: string;
  title: string;
  periodType: "weekly" | "monthly";
  targetValue: number;
  currentValue: number;
  unit: string;
  status: "active" | "completed" | "archived";
}

export interface PlanScheduleItem {
  planTaskId: string;
  title: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  completed: boolean;
}

export interface FocusNoteItem {
  id: string;
  taskTitle: string | null;
  creditedMinutes: number;
  startedAt: string;
  note: string | null;
}

export async function listGoals(): Promise<GoalRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("goals")
        .select("id, title, period_type, target_value, current_value, unit, status")
        .eq("user_id", ctx.userId)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) {
        console.error("[v3] listGoals failed:", error.message);
        return [];
      }
      return (data ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        periodType: r.period_type === "monthly" ? "monthly" : "weekly",
        targetValue: Number(r.target_value ?? 1),
        currentValue: Number(r.current_value ?? 0),
        unit: String(r.unit ?? "hours"),
        status:
          r.status === "completed"
            ? "completed"
            : r.status === "archived"
              ? "archived"
              : "active",
      }));
    } catch {
      return [];
    }
  }

  return withUser(async (db) => {
    const res = await db.query<{
      id: string;
      title: string;
      period_type: string;
      target_value: string | number;
      current_value: string | number;
      unit: string;
      status: string;
    }>(
      `select id, title, period_type, target_value, current_value, unit, status
       from public.goals
       where user_id = $1 and status <> 'archived'
       order by created_at desc
       limit 30`,
      [LOCAL_USER_ID],
    );
    return res.rows.map((r) => ({
      id: r.id,
      title: r.title,
      periodType: r.period_type === "monthly" ? "monthly" : "weekly",
      targetValue: Number(r.target_value),
      currentValue: Number(r.current_value),
      unit: r.unit,
      status:
        r.status === "completed"
          ? "completed"
          : r.status === "archived"
            ? "archived"
            : "active",
    }));
  });
}

export async function createGoal(input: {
  title: string;
  periodType: "weekly" | "monthly";
  targetValue: number;
  unit: string;
}): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase.from("goals").insert({
      user_id: ctx.userId,
      title: input.title.trim(),
      period_type: input.periodType,
      target_value: Math.max(1, input.targetValue),
      current_value: 0,
      unit: input.unit.trim() || "hours",
    });
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `insert into public.goals (user_id, title, period_type, target_value, current_value, unit)
       values ($1, $2, $3, $4, 0, $5)`,
      [LOCAL_USER_ID, input.title.trim(), input.periodType, Math.max(1, input.targetValue), input.unit.trim() || "hours"],
    );
  });
}

export async function incrementGoalProgress(goalId: string, delta: number): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { data, error } = await ctx.supabase
      .from("goals")
      .select("current_value, target_value")
      .eq("id", goalId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Goal not found.");
    const next = Math.max(0, Number(data.current_value ?? 0) + delta);
    const completed = next >= Number(data.target_value ?? 1);
    const { error: upErr } = await ctx.supabase
      .from("goals")
      .update({
        current_value: next,
        status: completed ? "completed" : "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", goalId)
      .eq("user_id", ctx.userId);
    if (upErr) throw new Error(upErr.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `update public.goals
       set current_value = greatest(0, current_value + $1),
           status = case when greatest(0, current_value + $1) >= target_value then 'completed' else 'active' end,
           updated_at = now()
       where id = $2 and user_id = $3`,
      [delta, goalId, LOCAL_USER_ID],
    );
  });
}

export async function deleteGoal(goalId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase
      .from("goals")
      .delete()
      .eq("id", goalId)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return;
  }
  await withUser(async (db) => {
    await db.query("delete from public.goals where id = $1 and user_id = $2", [
      goalId,
      LOCAL_USER_ID,
    ]);
  });
}

export async function setPlanTaskSchedule(
  planTaskId: string,
  start: string | null,
  end: string | null,
): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase.rpc("rpc_set_plan_task_schedule", {
      p_plan_task_id: planTaskId,
      p_start: start ?? "",
      p_end: end ?? "",
    });
    if (error) throw new Error(error.message);
    return;
  }
  await withUser(async (db) => {
    await db.query("select public.rpc_set_plan_task_schedule($1, $2, $3)", [
      planTaskId,
      start ?? "",
      end ?? "",
    ]);
  });
}

export async function listPlanSchedules(planId: string | null): Promise<PlanScheduleItem[]> {
  if (!planId) return [];
  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("daily_plan_tasks")
        .select("id, scheduled_start, scheduled_end, completed_at, tasks!inner(title)")
        .eq("plan_id", planId)
        .eq("user_id", ctx.userId);
      if (error) return [];
      return (data ?? []).map((r) => {
        const t = Array.isArray(r.tasks) ? r.tasks[0] : r.tasks;
        return {
          planTaskId: String(r.id),
          title: String((t as { title?: string } | null)?.title ?? "Task"),
          scheduledStart: (r.scheduled_start as string | null) ?? null,
          scheduledEnd: (r.scheduled_end as string | null) ?? null,
          completed: Boolean(r.completed_at),
        };
      });
    } catch {
      return [];
    }
  }

  return withUser(async (db) => {
    const res = await db.query<{
      id: string;
      title: string;
      scheduled_start: string | null;
      scheduled_end: string | null;
      completed_at: string | Date | null;
    }>(
      `select pt.id, t.title, pt.scheduled_start, pt.scheduled_end, pt.completed_at
       from public.daily_plan_tasks pt
       join public.tasks t on t.id = pt.task_id
       where pt.plan_id = $1 and pt.user_id = $2`,
      [planId, LOCAL_USER_ID],
    );
    return res.rows.map((r) => ({
      planTaskId: r.id,
      title: r.title,
      scheduledStart: r.scheduled_start,
      scheduledEnd: r.scheduled_end,
      completed: Boolean(r.completed_at),
    }));
  });
}

export async function saveFocusSessionNote(sessionId: string, note: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase.rpc("rpc_save_focus_session_note", {
      p_session_id: sessionId,
      p_note: note,
    });
    if (error) throw new Error(error.message);
    return;
  }
  await withUser(async (db) => {
    await db.query("select public.rpc_save_focus_session_note($1, $2)", [sessionId, note]);
  });
}

export async function listRecentFocusNotes(limit = 5): Promise<FocusNoteItem[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("focus_sessions")
        .select("id, credited_minutes, started_at, note, task_id")
        .eq("user_id", ctx.userId)
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(limit);
      if (error) return [];
      const rows = (data ?? []) as Array<{
        id: string;
        credited_minutes: number;
        started_at: string;
        note: string | null;
        task_id: string | null;
      }>;
      const taskIds = rows.map((r) => r.task_id).filter((id): id is string => Boolean(id));
      const titleMap = new Map<string, string>();
      if (taskIds.length > 0) {
        const { data: tasks } = await ctx.supabase
          .from("tasks")
          .select("id, title")
          .in("id", taskIds);
        for (const t of tasks ?? []) {
          titleMap.set(String(t.id), String(t.title));
        }
      }
      return rows.map((r) => ({
        id: r.id,
        taskTitle: r.task_id ? (titleMap.get(r.task_id) ?? null) : null,
        creditedMinutes: Number(r.credited_minutes ?? 0),
        startedAt: r.started_at,
        note: r.note ?? null,
      }));
    } catch {
      return [];
    }
  }

  return withUser(async (db) => {
    const res = await db.query<{
      id: string;
      title: string | null;
      credited_minutes: number;
      started_at: string | Date;
      note: string | null;
    }>(
      `select f.id, t.title, f.credited_minutes, f.started_at, f.note
       from public.focus_sessions f
       left join public.tasks t on t.id = f.task_id
       where f.user_id = $1 and f.status = 'completed'
       order by f.started_at desc
       limit $2`,
      [LOCAL_USER_ID, limit],
    );
    return res.rows.map((r) => ({
      id: r.id,
      taskTitle: r.title,
      creditedMinutes: Number(r.credited_minutes ?? 0),
      startedAt:
        r.started_at instanceof Date ? r.started_at.toISOString() : String(r.started_at),
      note: r.note,
    }));
  });
}
