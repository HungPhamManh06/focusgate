import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  selectNextMoveFromTasks,
  type NextMoveCandidateResult,
} from "@/lib/domain/dashboard-state";
import { getSupabaseContext, unwrapSupabase } from "@/lib/supabase/data-client";
import { toIso } from "./format";
import type { Plan, Task } from "./types";

export type NextMoveSuggestion = NextMoveCandidateResult;

interface TaskSelectRow {
  id: string;
  title: string;
  description: string | null;
  category: Task["category"];
  kind: Task["kind"];
  priority: Task["priority"];
  estimated_minutes: number;
  required_focus_minutes: number;
  due_date: string | Date | null;
  status: Task["status"];
  completed_at: string | Date | null;
  created_at: string | Date;
}

function mapTaskRow(row: TaskSelectRow): Task {
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

export async function getUpcomingTasks(limit = 4): Promise<Task[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .select(
          "id, title, description, category, kind, priority, estimated_minutes, required_focus_minutes, due_date, status, completed_at, created_at",
        )
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress"])
        .not("due_date", "is", null)
        .order("due_date", { ascending: true })
        .limit(limit),
    ) as TaskSelectRow[];
    return rows.map(mapTaskRow);
  }

  return withUser(async (db) => {
    const result = await db.query<TaskSelectRow>(
      `select id, title, description, category, kind, priority,
              estimated_minutes, required_focus_minutes, due_date, status,
              completed_at, created_at
       from public.tasks
       where user_id = $1 and status in ('todo', 'in_progress') and due_date is not null
       order by due_date asc
       limit $2`,
      [LOCAL_USER_ID, limit],
    );

    return result.rows.map(mapTaskRow);
  });
}

const KIND_ORDER: Record<Task["kind"], number> = { must_do: 0, should_do: 1, bonus: 2 };
const PRIORITY_ORDER: Record<Task["priority"], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export async function getNextMoveCandidate(plan: Plan | null): Promise<NextMoveSuggestion | null> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .select(
          "id, title, description, category, kind, priority, estimated_minutes, required_focus_minutes, due_date, status, completed_at, created_at",
        )
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress"]),
    ) as TaskSelectRow[];

    const openTasks = rows
      .map(mapTaskRow)
      .sort((a, b) => {
        const kindDiff = (KIND_ORDER[a.kind] ?? 2) - (KIND_ORDER[b.kind] ?? 2);
        if (kindDiff !== 0) return kindDiff;
        if (a.dueDate && b.dueDate) {
          const dueDiff = a.dueDate.localeCompare(b.dueDate);
          if (dueDiff !== 0) return dueDiff;
        } else if (a.dueDate) {
          return -1;
        } else if (b.dueDate) {
          return 1;
        }
        const priorityDiff = (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3);
        if (priorityDiff !== 0) return priorityDiff;
        return a.createdAt.localeCompare(b.createdAt);
      })
      .slice(0, 30);

    return selectNextMoveFromTasks(openTasks, plan);
  }

  return withUser(async (db) => {
    const openResult = await db.query<TaskSelectRow>(
      `select id, title, description, category, kind, priority,
              estimated_minutes, required_focus_minutes, due_date, status,
              completed_at, created_at
       from public.tasks
       where user_id = $1 and status in ('todo', 'in_progress')
       order by
         case kind when 'must_do' then 0 when 'should_do' then 1 else 2 end asc,
         due_date asc nulls last,
         case priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 else 3 end asc,
         created_at asc
       limit 30`,
      [LOCAL_USER_ID],
    );

    const openTasks = openResult.rows.map(mapTaskRow);
    return selectNextMoveFromTasks(openTasks, plan);
  });
}
