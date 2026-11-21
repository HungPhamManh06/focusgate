import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { toIso } from "./format";
import type { Task } from "./types";

export async function getUpcomingTasks(limit = 4): Promise<Task[]> {
  return withUser(async (db) => {
    const result = await db.query<{
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
    }>(
      `select id, title, description, category, kind, priority,
              estimated_minutes, required_focus_minutes, due_date, status,
              completed_at, created_at
       from public.tasks
       where user_id = $1 and status in ('todo', 'in_progress') and due_date is not null
       order by due_date asc
       limit $2`,
      [LOCAL_USER_ID, limit],
    );

    return result.rows.map((row) => ({
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
    }));
  });
}
