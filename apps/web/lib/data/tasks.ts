import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
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

export async function listTasks(filters: TaskFilters = {}): Promise<Task[]> {
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
  await withUser(async (db) => {
    await db.query(
      `update public.tasks set status = 'todo'
       where id = $1 and user_id = $2 and status = 'completed'`,
      [id, LOCAL_USER_ID],
    );
  });
}
