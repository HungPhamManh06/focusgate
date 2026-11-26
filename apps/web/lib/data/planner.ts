import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_USER_ID, withUser, type Db } from "@/lib/db";
import {
  assertSupabaseOk,
  getSupabaseContext,
  getSupabaseUserTimezone,
  localDateInTimezone,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { toIso } from "./format";
import { resetStaleDailyHabitsForNewDay } from "./tasks";
import type {
  Plan,
  PlanEvent,
  PlanProgress,
  PlanStatus,
  PlanTask,
  Task,
  TaskKind,
} from "./types";

interface PlanRow {
  id: string;
  plan_date: string;
  status: PlanStatus;
  confirmed_at: string | Date | null;
  activated_at: string | Date | null;
  completed_at: string | Date | null;
}

interface PlanTaskRow {
  id: string;
  task_id: string;
  kind: TaskKind;
  required_focus_minutes: number;
  completed_at: string | Date | null;
  title: string;
  description: string | null;
  status: PlanTask["status"];
  priority: PlanTask["priority"];
  focus_done: number;
}

interface EventRow {
  id: string;
  event_type: string;
  reason: string | null;
  created_at: string | Date;
}

interface ProgressRow {
  must_do_total: number;
  must_do_completed: number;
  focus_required: number;
  focus_done: number;
  bonus_completed: number;
}

function mapProgress(row: ProgressRow | undefined): PlanProgress {
  return {
    mustDoTotal: row?.must_do_total ?? 0,
    mustDoCompleted: row?.must_do_completed ?? 0,
    focusRequired: row?.focus_required ?? 0,
    focusDone: row?.focus_done ?? 0,
    bonusCompleted: row?.bonus_completed ?? 0,
  };
}

async function loadPlan(db: Db, planId: string): Promise<Plan | null> {
  const planResult = await db.query<PlanRow>(
    `select id, to_char(plan_date, 'YYYY-MM-DD') as plan_date, status,
            confirmed_at, activated_at, completed_at
     from public.daily_plans
     where id = $1 and user_id = $2`,
    [planId, LOCAL_USER_ID],
  );
  const row = planResult.rows[0];
  if (!row) return null;

  const tasksResult = await db.query<PlanTaskRow>(
    `select pt.id, pt.task_id, pt.kind, pt.required_focus_minutes, pt.completed_at,
            t.title, t.description, t.status, t.priority,
            coalesce((
              select sum(fs.credited_minutes)
              from public.focus_sessions fs
              where fs.user_id = $2
                and fs.task_id = pt.task_id
                and fs.daily_plan_id = pt.plan_id
                and fs.is_valid
            ), 0)::int as focus_done
     from public.daily_plan_tasks pt
     join public.tasks t on t.id = pt.task_id
     where pt.plan_id = $1 and pt.user_id = $2
     order by case pt.kind when 'must_do' then 0 when 'should_do' then 1 else 2 end,
              pt.sort_order asc, pt.created_at asc`,
    [planId, LOCAL_USER_ID],
  );

  const progressResult = await db.query<ProgressRow>(
    `select must_do_total, must_do_completed, must_do_focus_required as focus_required,
            must_do_focus_done as focus_done, bonus_completed
     from public.v_plan_progress where plan_id = $1 and user_id = $2`,
    [planId, LOCAL_USER_ID],
  );

  const eventsResult = await db.query<EventRow>(
    `select id, event_type, reason, created_at
     from public.daily_plan_events
     where plan_id = $1 and user_id = $2
     order by created_at desc limit 12`,
    [planId, LOCAL_USER_ID],
  );

  const tasks: PlanTask[] = tasksResult.rows.map((task) => ({
    id: task.id,
    taskId: task.task_id,
    kind: task.kind,
    requiredFocusMinutes: task.required_focus_minutes,
    completedAt: toIso(task.completed_at),
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    focusDone: task.focus_done,
  }));

  const events: PlanEvent[] = eventsResult.rows.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    reason: event.reason,
    createdAt: toIso(event.created_at) ?? new Date().toISOString(),
  }));

  return {
    id: row.id,
    planDate: row.plan_date,
    status: row.status,
    confirmedAt: toIso(row.confirmed_at),
    activatedAt: toIso(row.activated_at),
    completedAt: toIso(row.completed_at),
    tasks,
    events,
    progress: mapProgress(progressResult.rows[0]),
  };
}

const KIND_ORDER: Record<TaskKind, number> = { must_do: 0, should_do: 1, bonus: 2 };
const PRIORITY_ORDER: Record<Task["priority"], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

async function loadPlanSupabase(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
): Promise<Plan | null> {
  const { data: planRow, error: planErr } = await supabase
    .from("daily_plans")
    .select("id, plan_date, status, confirmed_at, activated_at, completed_at")
    .eq("id", planId)
    .eq("user_id", userId)
    .maybeSingle();
  if (planErr) throw new Error(planErr.message);
  if (!planRow) return null;

  const [tasksRes, focusRes, progressRes, eventsRes] = await Promise.all([
    supabase
      .from("daily_plan_tasks")
      .select(
        "id, task_id, kind, required_focus_minutes, completed_at, sort_order, created_at, tasks!inner(title, description, status, priority)",
      )
      .eq("plan_id", planId)
      .eq("user_id", userId),
    supabase
      .from("focus_sessions")
      .select("task_id, credited_minutes")
      .eq("user_id", userId)
      .eq("daily_plan_id", planId)
      .eq("is_valid", true),
    supabase
      .from("v_plan_progress")
      .select(
        "must_do_total, must_do_completed, must_do_focus_required, must_do_focus_done, bonus_completed",
      )
      .eq("plan_id", planId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("daily_plan_events")
      .select("id, event_type, reason, created_at")
      .eq("plan_id", planId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const rawTasks = unwrapSupabase(tasksRes) as Array<{
    id: string;
    task_id: string;
    kind: TaskKind;
    required_focus_minutes: number;
    completed_at: string | null;
    sort_order: number;
    created_at: string;
    tasks:
      | { title: string; description: string | null; status: PlanTask["status"]; priority: PlanTask["priority"] }
      | Array<{ title: string; description: string | null; status: PlanTask["status"]; priority: PlanTask["priority"] }>;
  }>;
  const focusRows = unwrapSupabase(focusRes) as Array<{
    task_id: string | null;
    credited_minutes: number;
  }>;
  if (progressRes.error) throw new Error(progressRes.error.message);
  const eventRows = unwrapSupabase(eventsRes) as EventRow[];

  const focusByTask = new Map<string, number>();
  for (const row of focusRows) {
    if (!row.task_id) continue;
    focusByTask.set(row.task_id, (focusByTask.get(row.task_id) ?? 0) + row.credited_minutes);
  }

  const tasks: PlanTask[] = rawTasks
    .sort((a, b) => {
      const kindDiff = (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2);
      if (kindDiff !== 0) return kindDiff;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    })
    .map((item) => {
      const task = Array.isArray(item.tasks) ? item.tasks[0]! : item.tasks;
      return {
        id: item.id,
        taskId: item.task_id,
        kind: item.kind,
        requiredFocusMinutes: item.required_focus_minutes,
        completedAt: toIso(item.completed_at),
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        focusDone: focusByTask.get(item.task_id) ?? 0,
      };
    });

  const events: PlanEvent[] = eventRows.map((event) => ({
    id: event.id,
    eventType: event.event_type,
    reason: event.reason,
    createdAt: toIso(event.created_at) ?? new Date().toISOString(),
  }));

  const p = progressRes.data as {
    must_do_total: number;
    must_do_completed: number;
    must_do_focus_required: number;
    must_do_focus_done: number;
    bonus_completed: number;
  } | null;

  return {
    id: planRow.id as string,
    planDate: String(planRow.plan_date).slice(0, 10),
    status: planRow.status as PlanStatus,
    confirmedAt: toIso(planRow.confirmed_at as string | null),
    activatedAt: toIso(planRow.activated_at as string | null),
    completedAt: toIso(planRow.completed_at as string | null),
    tasks,
    events,
    progress: mapProgress(
      p
        ? {
            must_do_total: p.must_do_total,
            must_do_completed: p.must_do_completed,
            focus_required: p.must_do_focus_required,
            focus_done: p.must_do_focus_done,
            bonus_completed: p.bonus_completed,
          }
        : undefined,
    ),
  };
}

export async function getTodayPlan(): Promise<Plan | null> {
  await resetStaleDailyHabitsForNewDay().catch(() => 0);
  const ctx = await getSupabaseContext();
  if (ctx) {
    const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
    const today = localDateInTimezone(timezone);
    const { data, error } = await ctx.supabase
      .from("daily_plans")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("plan_date", today)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data?.id ? loadPlanSupabase(ctx.supabase, ctx.userId, data.id as string) : null;
  }

  return withUser(async (db) => {
    const result = await db.query<{ id: string }>(
      `select p.id
       from public.daily_plans p
       join public.profiles pr on pr.id = p.user_id
       where p.user_id = $1
         and p.plan_date = (now() at time zone pr.timezone)::date
       limit 1`,
      [LOCAL_USER_ID],
    );
    const plan = result.rows[0];
    return plan ? loadPlan(db, plan.id) : null;
  });
}

export async function getPlanById(planId: string): Promise<Plan | null> {
  const ctx = await getSupabaseContext();
  if (ctx) return loadPlanSupabase(ctx.supabase, ctx.userId, planId);
  return withUser((db) => loadPlan(db, planId));
}

export async function getPlannerBacklog(planId: string | null): Promise<Task[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    let excludedIds = new Set<string>();
    if (planId) {
      const existing = unwrapSupabase(
        await ctx.supabase
          .from("daily_plan_tasks")
          .select("task_id")
          .eq("plan_id", planId)
          .eq("user_id", ctx.userId),
      ) as Array<{ task_id: string }>;
      excludedIds = new Set(existing.map((row) => row.task_id));
    }

    const rows = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .select(
          "id, title, description, category, kind, priority, estimated_minutes, required_focus_minutes, due_date, status, completed_at, created_at",
        )
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress"]),
    ) as Array<{
      id: string;
      title: string;
      description: string | null;
      category: Task["category"];
      kind: TaskKind;
      priority: Task["priority"];
      estimated_minutes: number;
      required_focus_minutes: number;
      due_date: string | null;
      status: Task["status"];
      completed_at: string | null;
      created_at: string;
    }>;

    return rows
      .filter((row) => !excludedIds.has(row.id))
      .map((task) => ({
        id: task.id,
        title: task.title,
        description: task.description,
        category: task.category,
        kind: task.kind,
        priority: task.priority,
        estimatedMinutes: task.estimated_minutes,
        requiredFocusMinutes: task.required_focus_minutes,
        dueDate: toIso(task.due_date),
        status: task.status,
        completedAt: toIso(task.completed_at),
        createdAt: toIso(task.created_at) ?? new Date().toISOString(),
      }))
      .sort((a, b) => {
        const priorityDiff = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
        if (priorityDiff !== 0) return priorityDiff;
        if (a.dueDate && b.dueDate) {
          const dueDiff = a.dueDate.localeCompare(b.dueDate);
          if (dueDiff !== 0) return dueDiff;
        } else if (a.dueDate) {
          return -1;
        } else if (b.dueDate) {
          return 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      })
      .slice(0, 20);
  }

  return withUser(async (db) => {
    const params: unknown[] = [LOCAL_USER_ID];
    let exclude = "";
    if (planId) {
      params.push(planId);
      exclude = `and not exists (
        select 1 from public.daily_plan_tasks pt
        where pt.plan_id = $${params.length} and pt.task_id = t.id
      )`;
    }

    const result = await db.query<{
      id: string;
      title: string;
      description: string | null;
      category: Task["category"];
      kind: TaskKind;
      priority: Task["priority"];
      estimated_minutes: number;
      required_focus_minutes: number;
      due_date: string | Date | null;
      status: Task["status"];
      completed_at: string | Date | null;
      created_at: string | Date;
    }>(
      `select t.id, t.title, t.description, t.category, t.kind, t.priority,
              t.estimated_minutes, t.required_focus_minutes, t.due_date, t.status,
              t.completed_at, t.created_at
       from public.tasks t
       where t.user_id = $1 and t.status in ('todo', 'in_progress') ${exclude}
       order by
         case t.priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
         t.due_date asc nulls last, t.created_at desc
       limit 20`,
      params,
    );

    return result.rows.map((task) => ({
      id: task.id,
      title: task.title,
      description: task.description,
      category: task.category,
      kind: task.kind,
      priority: task.priority,
      estimatedMinutes: task.estimated_minutes,
      requiredFocusMinutes: task.required_focus_minutes,
      dueDate: toIso(task.due_date),
      status: task.status,
      completedAt: toIso(task.completed_at),
      createdAt: toIso(task.created_at) ?? new Date().toISOString(),
    }));
  });
}

export async function ensureTodayPlan(): Promise<string> {
  await resetStaleDailyHabitsForNewDay().catch(() => 0);
  const ctx = await getSupabaseContext();
  if (ctx) {
    const payload = unwrapSupabase(
      await ctx.supabase.rpc("rpc_create_daily_plan", { p_plan_date: null }),
      "Could not create the daily plan.",
    ) as { planId?: string };
    if (!payload.planId) throw new Error("Could not create the daily plan.");
    // Auto-load flagged daily habits if the freshly created draft plan is empty.
    const { count } = await ctx.supabase
      .from("daily_plan_tasks")
      .select("id", { count: "exact", head: true })
      .eq("plan_id", payload.planId)
      .eq("user_id", ctx.userId);
    if ((count ?? 0) === 0) {
      await ctx.supabase
        .rpc("rpc_populate_today_habits", { p_plan_id: payload.planId })
        .then(() => undefined, () => undefined);
    }
    return payload.planId;
  }

  return withUser(async (db) => {
    const result = await db.query<{ result: { planId: string } }>(
      "select public.rpc_create_daily_plan(null) as result",
    );
    const planId = result.rows[0]?.result?.planId;
    if (!planId) throw new Error("Could not create the daily plan.");
    const cnt = await db.query<{ c: number }>(
      "select count(*)::int as c from public.daily_plan_tasks where plan_id = $1 and user_id = $2",
      [planId, LOCAL_USER_ID],
    );
    if ((cnt.rows[0]?.c ?? 0) === 0) {
      await db
        .query("select public.rpc_populate_today_habits($1)", [planId])
        .catch(() => undefined);
    }
    return planId;
  });
}

export async function addPlanTask(
  planId: string,
  taskId: string,
  kind: TaskKind,
): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase.rpc("rpc_add_plan_task", {
        p_plan_id: planId,
        p_task_id: taskId,
        p_kind: kind,
        p_planned_start: null,
        p_planned_minutes: null,
      }),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query(
      "select public.rpc_add_plan_task($1, $2, $3::public.task_kind, null, null)",
      [planId, taskId, kind],
    );
  });
}

export async function removePlanTask(planTaskId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase.rpc("rpc_remove_plan_task", { p_plan_task_id: planTaskId }),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query("select public.rpc_remove_plan_task($1)", [planTaskId]);
  });
}

export async function amendPlanTask(
  planTaskId: string,
  newKind: TaskKind,
  reason: string | null = null,
): Promise<{ changed: boolean; exception: boolean }> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const res = await ctx.supabase.rpc("rpc_amend_plan_task", {
      p_plan_task_id: planTaskId,
      p_new_kind: newKind,
      p_reason: reason,
    });
    assertSupabaseOk(res);
    return (res.data as { changed: boolean; exception: boolean } | null) ?? {
      changed: false,
      exception: false,
    };
  }

  return withUser(async (db) => {
    const result = await db.query<{ result: { changed: boolean; exception: boolean } }>(
      "select public.rpc_amend_plan_task($1, $2::public.task_kind, $3) as result",
      [planTaskId, newKind, reason],
    );
    return result.rows[0]?.result ?? { changed: false, exception: false };
  });
}

export async function confirmPlan(planId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(await ctx.supabase.rpc("rpc_confirm_plan", { p_plan_id: planId }));
    return;
  }

  await withUser(async (db) => {
    await db.query("select public.rpc_confirm_plan($1)", [planId]);
  });
}

export async function activatePlan(planId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(await ctx.supabase.rpc("rpc_activate_plan", { p_plan_id: planId }));
    return;
  }

  await withUser(async (db) => {
    await db.query("select public.rpc_activate_plan($1)", [planId]);
  });
}

export async function completePlan(planId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(await ctx.supabase.rpc("rpc_complete_plan", { p_plan_id: planId }));
    return;
  }

  await withUser(async (db) => {
    await db.query("select public.rpc_complete_plan($1)", [planId]);
  });
}

export async function completePlanTask(planTaskId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase.rpc("rpc_complete_plan_task", { p_plan_task_id: planTaskId }),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query("select public.rpc_complete_plan_task($1)", [planTaskId]);
  });
}

export async function populateTodayHabits(planId: string): Promise<number> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const res = await ctx.supabase.rpc("rpc_populate_today_habits", { p_plan_id: planId });
    assertSupabaseOk(res);
    return (res.data as { added?: number } | null)?.added ?? 0;
  }

  return withUser(async (db) => {
    const res = await db.query<{ result: { added?: number } }>(
      "select public.rpc_populate_today_habits($1) as result",
      [planId],
    );
    return res.rows[0]?.result?.added ?? 0;
  });
}
