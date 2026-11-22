import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { toIso } from "./format";
import type { Plan, Task } from "./types";

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

export interface NextMoveSuggestion {
  task: Task;
  inTodayPlan: boolean;
  planTaskId: string | null;
  focusDone: number;
  focusRequired: number;
  reason: string;
}

/**
 * Selects the single highest-leverage next task using real database records:
 * 1. Unfinished Must-Do tasks first (never suggests a Bonus task while Must-Dos remain open).
 * 2. Nearest deadline (overdue / due today prioritized ahead of tasks without deadlines).
 * 3. Highest priority (urgent -> high -> medium -> low).
 */
export async function getNextMoveCandidate(plan: Plan | null): Promise<NextMoveSuggestion | null> {
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
       limit 25`,
      [LOCAL_USER_ID],
    );

    const openTasks = openResult.rows.map(mapTaskRow);
    if (openTasks.length === 0) return null;

    const openPlanTasks =
      plan && plan.status !== "completed" && plan.status !== "skipped"
        ? plan.tasks.filter((pt) => !pt.completedAt && pt.status !== "completed")
        : [];

    const hasOpenMustDo =
      openPlanTasks.some((pt) => pt.kind === "must_do") ||
      openTasks.some((t) => t.kind === "must_do");

    // If today's plan has open tasks, prioritize within today's plan first.
    if (openPlanTasks.length > 0) {
      const eligiblePlanTasks = hasOpenMustDo
        ? openPlanTasks.filter((pt) => pt.kind !== "bonus")
        : openPlanTasks;

      const sortedPlanTasks = [...eligiblePlanTasks].sort((a, b) => {
        const kindRank = (k: Task["kind"]) => (k === "must_do" ? 0 : k === "should_do" ? 1 : 2);
        if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(a.kind) - kindRank(b.kind);

        const taskA = openTasks.find((t) => t.id === a.taskId);
        const taskB = openTasks.find((t) => t.id === b.taskId);
        const dueA = taskA?.dueDate ? new Date(taskA.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const dueB = taskB?.dueDate ? new Date(taskB.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (dueA !== dueB) return dueA - dueB;

        const prioRank = (p: Task["priority"]) =>
          p === "urgent" ? 0 : p === "high" ? 1 : p === "medium" ? 2 : 3;
        return prioRank(a.priority) - prioRank(b.priority);
      });

      const chosenPlanTask = sortedPlanTasks[0];
      if (chosenPlanTask) {
        const matchingTask = openTasks.find((t) => t.id === chosenPlanTask.taskId) ?? {
          id: chosenPlanTask.taskId,
          title: chosenPlanTask.title,
          description: chosenPlanTask.description,
          category: "work",
          kind: chosenPlanTask.kind,
          priority: chosenPlanTask.priority,
          estimatedMinutes: Math.max(25, chosenPlanTask.requiredFocusMinutes),
          requiredFocusMinutes: chosenPlanTask.requiredFocusMinutes,
          dueDate: null,
          status: chosenPlanTask.status,
          completedAt: chosenPlanTask.completedAt,
          createdAt: new Date().toISOString(),
        };

        const remainingFocus = Math.max(
          0,
          chosenPlanTask.requiredFocusMinutes - chosenPlanTask.focusDone,
        );

        let reason = "In today's plan.";
        if (chosenPlanTask.kind === "must_do") {
          reason =
            remainingFocus > 0
              ? `Committed Must-do in today's plan · needs ${remainingFocus}m more verified focus to unlock the gate.`
              : "Committed Must-do in today's plan · focus requirement met and ready to complete.";
        } else if (chosenPlanTask.kind === "should_do") {
          reason = "Next Should-do in today's plan after your core commitments.";
        } else {
          reason = "All Must-do commitments are clear — this Bonus task earns extra reward minutes.";
        }

        return {
          task: matchingTask,
          inTodayPlan: true,
          planTaskId: chosenPlanTask.id,
          focusDone: chosenPlanTask.focusDone,
          focusRequired: chosenPlanTask.requiredFocusMinutes,
          reason,
        };
      }
    }

    // Otherwise fall back to the open backlog, suppressing Bonus while any Must-do is open.
    const eligibleBacklog = hasOpenMustDo
      ? openTasks.filter((t) => t.kind !== "bonus")
      : openTasks;
    const chosen = eligibleBacklog[0] ?? openTasks[0];
    if (!chosen) return null;

    let reason = "Highest-priority open task in your queue.";
    if (chosen.kind === "must_do" && chosen.dueDate) {
      reason = "Unfinished Must-do with the nearest deadline.";
    } else if (chosen.kind === "must_do") {
      reason = "Top unfinished Must-do waiting to be scheduled into today's plan.";
    } else if (chosen.dueDate) {
      reason = "Nearest upcoming deadline in your open work queue.";
    }

    return {
      task: chosen,
      inTodayPlan: false,
      planTaskId: null,
      focusDone: 0,
      focusRequired: chosen.requiredFocusMinutes,
      reason,
    };
  });
}
