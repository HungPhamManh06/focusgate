import "server-only";

import { LOCAL_USER_ID, withUser, type Db } from "@/lib/db";
import { toIso } from "./format";
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
              select sum(fs.actual_minutes)
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

export async function getTodayPlan(): Promise<Plan | null> {
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
  return withUser((db) => loadPlan(db, planId));
}

export async function getPlannerBacklog(planId: string | null): Promise<Task[]> {
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
  return withUser(async (db) => {
    const result = await db.query<{ result: { planId: string } }>(
      "select public.rpc_create_daily_plan(null) as result",
    );
    const planId = result.rows[0]?.result?.planId;
    if (!planId) throw new Error("Could not create the daily plan.");
    return planId;
  });
}

export async function addPlanTask(
  planId: string,
  taskId: string,
  kind: TaskKind,
): Promise<void> {
  await withUser(async (db) => {
    await db.query(
      "select public.rpc_add_plan_task($1, $2, $3::public.task_kind, null, null)",
      [planId, taskId, kind],
    );
  });
}

export async function removePlanTask(planTaskId: string): Promise<void> {
  await withUser(async (db) => {
    await db.query("select public.rpc_remove_plan_task($1)", [planTaskId]);
  });
}

export async function confirmPlan(planId: string): Promise<void> {
  await withUser(async (db) => {
    await db.query("select public.rpc_confirm_plan($1)", [planId]);
  });
}

export async function activatePlan(planId: string): Promise<void> {
  await withUser(async (db) => {
    await db.query("select public.rpc_activate_plan($1)", [planId]);
  });
}

export async function completePlan(planId: string): Promise<void> {
  await withUser(async (db) => {
    await db.query("select public.rpc_complete_plan($1)", [planId]);
  });
}

export async function completePlanTask(planTaskId: string): Promise<void> {
  await withUser(async (db) => {
    await db.query("select public.rpc_complete_plan_task($1)", [planTaskId]);
  });
}
