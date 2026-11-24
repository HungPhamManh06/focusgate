import "server-only";

import { getSupabaseContext, getSupabaseUserTimezone, localDateInTimezone, unwrapSupabase, assertSupabaseOk } from "@/lib/supabase/data-client";
import { getTodayPlan, completePlanTask } from "./planner";
import { getWalletSummary } from "./rewards";
import type { PlanStatus, TaskKind, TaskStatus } from "./types";

export interface AgentPlanTaskItem {
  planTaskId: string;
  taskId: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  requiredFocusMinutes: number;
  focusDone: number;
}

export interface AgentOpenTaskItem {
  taskId: string;
  title: string;
  kind: TaskKind;
  status: TaskStatus;
  requiredFocusMinutes: number;
}

export interface AgentPlanSnapshot {
  plan: {
    id: string;
    planDate: string;
    status: PlanStatus;
    allTasksTotal: number;
    allTasksCompleted: number;
    allCompleted: boolean;
    tasks: AgentPlanTaskItem[];
  } | null;
  openTasks: AgentOpenTaskItem[];
  activeGrantMinutes: number;
  unlocked: boolean;
}

const KIND_ORDER: Record<TaskKind, number> = { must_do: 0, should_do: 1, bonus: 2 };

export async function getAgentTodayPlan(request?: Request): Promise<AgentPlanSnapshot> {
  const ctx = await getSupabaseContext(request);
  if (!ctx) {
    const [plan, activeGrantMinutes] = await Promise.all([getTodayPlan(), getWalletSummary()]);
    if (!plan) {
      return { plan: null, openTasks: [], activeGrantMinutes, unlocked: activeGrantMinutes > 0 };
    }
    const tasks: AgentPlanTaskItem[] = plan.tasks.map((task) => ({
      planTaskId: task.id,
      taskId: task.taskId,
      title: task.title,
      kind: task.kind,
      status: task.status,
      requiredFocusMinutes: task.requiredFocusMinutes,
      focusDone: task.focusDone,
    }));
    const allTasksTotal = tasks.length;
    const allTasksCompleted = tasks.filter((task) => task.status === "completed").length;
    const allCompleted = allTasksTotal > 0 && allTasksCompleted === allTasksTotal;
    const unlocked = allTasksTotal > 0 ? allCompleted : activeGrantMinutes > 0;
    return {
      plan: {
        id: plan.id,
        planDate: plan.planDate,
        status: plan.status,
        allTasksTotal,
        allTasksCompleted,
        allCompleted,
        tasks,
      },
      openTasks: [],
      activeGrantMinutes,
      unlocked,
    };
  }

  const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
  const today = localDateInTimezone(timezone);

  const [planRes, grantsRes, openTasksRes] = await Promise.all([
    ctx.supabase
      .from("daily_plans")
      .select("id, plan_date, status")
      .eq("user_id", ctx.userId)
      .eq("plan_date", today)
      .maybeSingle(),
    ctx.supabase
      .from("unlock_grants")
      .select("remaining_minutes")
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .gt("remaining_minutes", 0),
    ctx.supabase
      .from("tasks")
      .select("id, title, kind, status, required_focus_minutes")
      .eq("user_id", ctx.userId)
      .in("status", ["todo", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  if (planRes.error) throw new Error(planRes.error.message);
  const grantRows = unwrapSupabase(grantsRes) as Array<{ remaining_minutes: number }>;
  const activeGrantMinutes = grantRows.reduce((sum, row) => sum + row.remaining_minutes, 0);
  const rawOpenTasks = (openTasksRes.data ?? []) as Array<{
    id: string;
    title: string;
    kind: TaskKind;
    status: TaskStatus;
    required_focus_minutes: number;
  }>;
  const sortOpenTasks = (items: AgentOpenTaskItem[]) =>
    items.sort((a, b) => (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2));

  const planRow = planRes.data as { id: string; plan_date: string; status: PlanStatus } | null;
  if (!planRow) {
    const openTasks = sortOpenTasks(
      rawOpenTasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        kind: t.kind,
        status: t.status,
        requiredFocusMinutes: t.required_focus_minutes,
      })),
    );
    return { plan: null, openTasks, activeGrantMinutes, unlocked: activeGrantMinutes > 0 };
  }

  const [tasksRes, focusRes] = await Promise.all([
    ctx.supabase
      .from("daily_plan_tasks")
      .select("id, task_id, kind, required_focus_minutes, sort_order, created_at, tasks!inner(title, status)")
      .eq("plan_id", planRow.id)
      .eq("user_id", ctx.userId),
    ctx.supabase
      .from("focus_sessions")
      .select("task_id, credited_minutes")
      .eq("user_id", ctx.userId)
      .eq("daily_plan_id", planRow.id)
      .eq("is_valid", true),
  ]);

  const rawTasks = unwrapSupabase(tasksRes) as Array<{
    id: string;
    task_id: string;
    kind: TaskKind;
    required_focus_minutes: number;
    sort_order: number;
    created_at: string;
    tasks: { title: string; status: TaskStatus } | Array<{ title: string; status: TaskStatus }>;
  }>;
  const focusRows = unwrapSupabase(focusRes) as Array<{
    task_id: string | null;
    credited_minutes: number;
  }>;

  const focusByTask = new Map<string, number>();
  for (const row of focusRows) {
    if (!row.task_id) continue;
    focusByTask.set(row.task_id, (focusByTask.get(row.task_id) ?? 0) + row.credited_minutes);
  }

  const tasks: AgentPlanTaskItem[] = rawTasks
    .sort((a, b) => {
      const kindDiff = (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2);
      if (kindDiff !== 0) return kindDiff;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.created_at.localeCompare(b.created_at);
    })
    .map((item) => {
      const task = Array.isArray(item.tasks) ? item.tasks[0]! : item.tasks;
      return {
        planTaskId: item.id,
        taskId: item.task_id,
        title: task.title,
        kind: item.kind,
        status: task.status,
        requiredFocusMinutes: item.required_focus_minutes,
        focusDone: focusByTask.get(item.task_id) ?? 0,
      };
    });

  const allTasksTotal = tasks.length;
  const allTasksCompleted = tasks.filter((task) => task.status === "completed").length;
  const allCompleted = allTasksTotal > 0 && allTasksCompleted === allTasksTotal;
  const unlocked = allTasksTotal > 0 ? allCompleted : activeGrantMinutes > 0;
  const plannedIds = new Set(tasks.map((t) => t.taskId));
  const openTasks = sortOpenTasks(
    rawOpenTasks
      .filter((t) => !plannedIds.has(t.id))
      .map((t) => ({
        taskId: t.id,
        title: t.title,
        kind: t.kind,
        status: t.status,
        requiredFocusMinutes: t.required_focus_minutes,
      })),
  );

  return {
    plan: {
      id: planRow.id,
      planDate: String(planRow.plan_date).slice(0, 10),
      status: planRow.status,
      allTasksTotal,
      allTasksCompleted,
      allCompleted,
      tasks,
    },
    openTasks,
    activeGrantMinutes,
    unlocked,
  };
}

export async function completeAgentPlanTask(
  input: { planTaskId: string; deviceId?: string | null },
  request?: Request,
): Promise<AgentPlanSnapshot> {
  const ctx = await getSupabaseContext(request);
  if (!ctx) {
    await completePlanTask(input.planTaskId);
    return getAgentTodayPlan(request);
  }

  const current = await getAgentTodayPlan(request);
  if (current.plan?.status === "draft") {
    assertSupabaseOk(await ctx.supabase.rpc("rpc_confirm_plan", { p_plan_id: current.plan.id }));
    assertSupabaseOk(await ctx.supabase.rpc("rpc_activate_plan", { p_plan_id: current.plan.id }));
  } else if (current.plan?.status === "confirmed") {
    assertSupabaseOk(await ctx.supabase.rpc("rpc_activate_plan", { p_plan_id: current.plan.id }));
  }

  assertSupabaseOk(
    await ctx.supabase.rpc("rpc_complete_plan_task_direct", {
      p_plan_task_id: input.planTaskId,
    }),
  );

  const snapshot = await getAgentTodayPlan(request);
  if (snapshot.plan?.allCompleted && snapshot.plan.status === "active") {
    await ctx.supabase
      .rpc("rpc_complete_plan", { p_plan_id: snapshot.plan.id })
      .then(() => undefined, () => undefined);

    if (input.deviceId) {
      await ctx.supabase
        .rpc("rpc_evaluate_unlock", {
          p_plan_id: snapshot.plan.id,
          p_device_id: input.deviceId,
          p_idempotency_key: `android-plan-${snapshot.plan.id}`,
        })
        .then(() => undefined, () => undefined);
    }

    return getAgentTodayPlan(request);
  }

  return snapshot;
}
