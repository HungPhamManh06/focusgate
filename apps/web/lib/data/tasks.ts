import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  assertSupabaseOk,
  getSupabaseContext,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { toIso } from "./format";
import type { Task, TaskCategory, TaskKind, TaskPriority, TaskStatus } from "./types";

export interface TaskFilters {
  kind?: TaskKind | null;
  view?: "open" | "done" | "all";
  search?: string | null;
}

export interface TaskCounts {
  total: number;
  open: number;
  completed: number;
  mustDoOpen: number;
  shouldDoOpen: number;
  bonusOpen: number;
}

export interface TaskInput {
  title: string;
  description: string | null;
  category: TaskCategory;
  kind: TaskKind;
  priority: TaskPriority;
  estimatedMinutes: number;
  requiredFocusMinutes: number;
  dueDate: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  category: TaskCategory;
  kind: TaskKind;
  priority: TaskPriority;
  estimated_minutes: number;
  required_focus_minutes: number;
  due_date: string | Date | null;
  status: TaskStatus;
  completed_at: string | Date | null;
  created_at: string | Date;
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    kind: row.kind,
    priority: row.priority,
    estimatedMinutes: row.estimated_minutes,
    requiredFocusMinutes: row.required_focus_minutes,
    dueDate: toIso(row.due_date),
    status: row.status,
    completedAt: toIso(row.completed_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

const TASK_COLUMNS = `id, title, description, category, kind, priority,
  estimated_minutes, required_focus_minutes, due_date, status, completed_at, created_at`;

const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  todo: 1,
  completed: 3,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function compareTasks(a: Task, b: Task): number {
  const statusDiff = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2);
  if (statusDiff !== 0) return statusDiff;
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
}

export async function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    let query = ctx.supabase
      .from("tasks")
      .select(TASK_COLUMNS)
      .eq("user_id", ctx.userId);

    if (filters.view === "open") {
      query = query.in("status", ["todo", "in_progress"]);
    } else if (filters.view === "done") {
      query = query.eq("status", "completed");
    }

    if (filters.kind) {
      query = query.eq("kind", filters.kind);
    }

    const search = filters.search?.trim();
    if (search) {
      const escaped = search.replace(/[%_]/g, "\\$&");
      query = query.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
    }

    const rows = unwrapSupabase(await query) as TaskRow[];
    return rows.map(mapTask).sort(compareTasks);
  }

  return withUser(async (db) => {
    const params: unknown[] = [LOCAL_USER_ID];
    let sql = `select ${TASK_COLUMNS} from public.tasks where user_id = $1`;

    if (filters.view === "open") {
      sql += ` and status in ('todo', 'in_progress')`;
    } else if (filters.view === "done") {
      sql += ` and status = 'completed'`;
    }

    if (filters.kind) {
      params.push(filters.kind);
      sql += ` and kind = $${params.length}::public.task_kind`;
    }

    if (filters.search?.trim()) {
      params.push(`%${filters.search.trim()}%`);
      sql += ` and (title ilike $${params.length} or coalesce(description, '') ilike $${params.length})`;
    }

    sql += ` order by
      case status when 'in_progress' then 0 when 'todo' then 1 when 'completed' then 3 else 2 end,
      case priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end,
      due_date asc nulls last, created_at desc`;

    const result = await db.query<TaskRow>(sql, params);
    return result.rows.map(mapTask);
  });
}

export async function getTaskCounts(): Promise<TaskCounts> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .select("status, kind")
        .eq("user_id", ctx.userId),
    ) as Array<{ status: TaskStatus; kind: TaskKind }>;

    let open = 0;
    let completed = 0;
    let mustDoOpen = 0;
    let shouldDoOpen = 0;
    let bonusOpen = 0;

    for (const row of rows) {
      if (row.status === "todo" || row.status === "in_progress") {
        open += 1;
        if (row.kind === "must_do") mustDoOpen += 1;
        else if (row.kind === "should_do") shouldDoOpen += 1;
        else if (row.kind === "bonus") bonusOpen += 1;
      } else if (row.status === "completed") {
        completed += 1;
      }
    }

    return { total: rows.length, open, completed, mustDoOpen, shouldDoOpen, bonusOpen };
  }

  return withUser(async (db) => {
    const result = await db.query<{
      total: number;
      open: number;
      completed: number;
      must_open: number;
      should_open: number;
      bonus_open: number;
    }>(
      `select
         count(*)::int as total,
         count(*) filter (where status in ('todo','in_progress'))::int as open,
         count(*) filter (where status = 'completed')::int as completed,
         count(*) filter (where status in ('todo','in_progress') and kind = 'must_do')::int as must_open,
         count(*) filter (where status in ('todo','in_progress') and kind = 'should_do')::int as should_open,
         count(*) filter (where status in ('todo','in_progress') and kind = 'bonus')::int as bonus_open
       from public.tasks where user_id = $1`,
      [LOCAL_USER_ID],
    );
    const row = result.rows[0];
    return {
      total: row?.total ?? 0,
      open: row?.open ?? 0,
      completed: row?.completed ?? 0,
      mustDoOpen: row?.must_open ?? 0,
      shouldDoOpen: row?.should_open ?? 0,
      bonusOpen: row?.bonus_open ?? 0,
    };
  });
}

export async function createTask(input: TaskInput): Promise<Task> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const row = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .insert({
          user_id: ctx.userId,
          title: input.title,
          description: input.description,
          category: input.category,
          kind: input.kind,
          priority: input.priority,
          estimated_minutes: input.estimatedMinutes,
          required_focus_minutes: input.requiredFocusMinutes,
          due_date: input.dueDate,
        })
        .select(TASK_COLUMNS)
        .single(),
      "Task was not created.",
    ) as TaskRow;
    return mapTask(row);
  }

  return withUser(async (db) => {
    const result = await db.query<TaskRow>(
      `insert into public.tasks
        (user_id, title, description, category, kind, priority,
         estimated_minutes, required_focus_minutes, due_date)
       values ($1, $2, $3, $4::public.task_category, $5::public.task_kind,
               $6::public.task_priority, $7, $8, $9)
       returning ${TASK_COLUMNS}`,
      [
        LOCAL_USER_ID,
        input.title,
        input.description,
        input.category,
        input.kind,
        input.priority,
        input.estimatedMinutes,
        input.requiredFocusMinutes,
        input.dueDate,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Task was not created.");
    return mapTask(row);
  });
}

export async function updateTask(id: string, input: TaskInput): Promise<Task> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const row = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .update({
          title: input.title,
          description: input.description,
          category: input.category,
          kind: input.kind,
          priority: input.priority,
          estimated_minutes: input.estimatedMinutes,
          required_focus_minutes: input.requiredFocusMinutes,
          due_date: input.dueDate,
        })
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .select(TASK_COLUMNS)
        .single(),
      "Task not found.",
    ) as TaskRow;
    return mapTask(row);
  }

  return withUser(async (db) => {
    const result = await db.query<TaskRow>(
      `update public.tasks set
         title = $3, description = $4, category = $5::public.task_category,
         kind = $6::public.task_kind, priority = $7::public.task_priority,
         estimated_minutes = $8, required_focus_minutes = $9, due_date = $10
       where id = $1 and user_id = $2
       returning ${TASK_COLUMNS}`,
      [
        id,
        LOCAL_USER_ID,
        input.title,
        input.description,
        input.category,
        input.kind,
        input.priority,
        input.estimatedMinutes,
        input.requiredFocusMinutes,
        input.dueDate,
      ],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Task not found.");
    return mapTask(row);
  });
}

export async function deleteTask(id: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase.from("tasks").delete().eq("id", id).eq("user_id", ctx.userId),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query("delete from public.tasks where id = $1 and user_id = $2", [
      id,
      LOCAL_USER_ID,
    ]);
  });
}

/**
 * Completing a task that belongs to an active daily plan goes through the
 * backend RPC so focus coverage is verified. Other tasks are simple toggles.
 */
export async function completeTask(id: string): Promise<{ viaPlan: boolean }> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const planTasks = unwrapSupabase(
      await ctx.supabase
        .from("daily_plan_tasks")
        .select("id, daily_plans!inner(status)")
        .eq("user_id", ctx.userId)
        .eq("task_id", id)
        .eq("daily_plans.status", "active")
        .limit(1),
    ) as Array<{ id: string }>;

    const activePlanTask = planTasks[0];
    if (activePlanTask) {
      assertSupabaseOk(
        await ctx.supabase.rpc("rpc_complete_plan_task", {
          p_plan_task_id: activePlanTask.id,
        }),
      );
      return { viaPlan: true };
    }

    assertSupabaseOk(
      await ctx.supabase
        .from("tasks")
        .update({ status: "completed" })
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .neq("status", "completed"),
    );
    return { viaPlan: false };
  }

  return withUser(async (db) => {
    const planTask = await db.query<{ id: string }>(
      `select pt.id
       from public.daily_plan_tasks pt
       join public.daily_plans p on p.id = pt.plan_id
       where pt.user_id = $1 and pt.task_id = $2 and p.status = 'active'
       limit 1`,
      [LOCAL_USER_ID, id],
    );

    const activePlanTask = planTask.rows[0];
    if (activePlanTask) {
      await db.query("select public.rpc_complete_plan_task($1)", [activePlanTask.id]);
      return { viaPlan: true };
    }

    await db.query(
      `update public.tasks set status = 'completed'
       where id = $1 and user_id = $2 and status <> 'completed'`,
      [id, LOCAL_USER_ID],
    );
    return { viaPlan: false };
  });
}

export async function reopenTask(id: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase
        .from("tasks")
        .update({ status: "todo" })
        .eq("id", id)
        .eq("user_id", ctx.userId)
        .eq("status", "completed"),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `update public.tasks set status = 'todo'
       where id = $1 and user_id = $2 and status = 'completed'`,
      [id, LOCAL_USER_ID],
    );
  });
}
