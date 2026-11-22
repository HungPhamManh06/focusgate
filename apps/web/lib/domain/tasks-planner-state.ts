import { formatDate, formatMinutes, relativeDue } from "../data/format.ts";
import type { Plan, PlanTask, Task } from "../data/types.ts";

export interface TaskRowStatusViewModel {
  completed: boolean;
  showPriorityBadge: boolean;
  showOverdue: boolean;
  dueLabel: string | null;
  completedLabel: string | null;
}

export function formatTaskRowStatus(
  task: Pick<Task, "status" | "dueDate" | "completedAt">,
  timezone: string,
): TaskRowStatusViewModel {
  const completed = task.status === "completed";
  if (completed) {
    return {
      completed: true,
      showPriorityBadge: false,
      showOverdue: false,
      dueLabel: null,
      completedLabel: task.completedAt
        ? `Completed ${formatDate(task.completedAt, undefined, timezone)}`
        : "Completed",
    };
  }

  const relative = relativeDue(task.dueDate, timezone);
  const dueLabel = relative ?? (task.dueDate ? formatDate(task.dueDate, undefined, timezone) : null);

  return {
    completed: false,
    showPriorityBadge: true,
    showOverdue: relative?.includes("overdue") ?? false,
    dueLabel,
    completedLabel: null,
  };
}

export interface PlannerSummaryViewModel {
  hasMustDos: boolean;
  mustDoProgressPercent: number;
  mustDoHeadline: string;
  mustDoCountLabel: string;
  headerMetaLine: string;
  hasFocusTarget: boolean;
  focusDoneLabel: string;
  focusTargetSuffix: string | null;
  focusCoverageLabel: string;
  totalPlanFocusRequired: number;
  totalPlanFocusLabel: string;
  isOverloaded: boolean;
}

export function buildPlannerSummaryViewModel(plan: Pick<Plan, "tasks" | "progress">): PlannerSummaryViewModel {
  const taskCount = plan.tasks.length;
  const taskCountLabel = `${taskCount} task${taskCount === 1 ? "" : "s"}`;
  const hasMustDos = plan.progress.mustDoTotal > 0;
  const mustDoProgressPercent = hasMustDos
    ? Math.round((plan.progress.mustDoCompleted / plan.progress.mustDoTotal) * 100)
    : 0;

  const hasFocusTarget = plan.progress.focusRequired > 0;
  const focusCoveragePercent = hasFocusTarget
    ? Math.round((plan.progress.focusDone / plan.progress.focusRequired) * 100)
    : 0;

  const totalPlanFocusRequired = plan.tasks.reduce(
    (sum, task) => sum + Math.max(0, task.requiredFocusMinutes),
    0,
  );

  return {
    hasMustDos,
    mustDoProgressPercent,
    mustDoHeadline: hasMustDos ? `${mustDoProgressPercent}%` : "Not configured",
    mustDoCountLabel: hasMustDos
      ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} done`
      : "No Must-dos yet",
    headerMetaLine: hasMustDos
      ? `${taskCountLabel} · ${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} must-dos done`
      : `${taskCountLabel} · No Must-dos yet`,
    hasFocusTarget,
    focusDoneLabel: hasFocusTarget
      ? formatMinutes(plan.progress.focusDone)
      : plan.progress.focusDone > 0
        ? formatMinutes(plan.progress.focusDone)
        : "Not set",
    focusTargetSuffix: hasFocusTarget ? `/ ${formatMinutes(plan.progress.focusRequired)}` : null,
    focusCoverageLabel: hasFocusTarget ? `${focusCoveragePercent}%` : "—",
    totalPlanFocusRequired,
    totalPlanFocusLabel: totalPlanFocusRequired > 0 ? formatMinutes(totalPlanFocusRequired) : "Not set",
    isOverloaded: totalPlanFocusRequired > 360,
  };
}

export function resolveInitialFocusTaskId(
  candidates: ReadonlyArray<{ id: string; inTodayPlan: boolean }>,
  requestedTaskId?: string | null,
): string {
  if (requestedTaskId && candidates.some((candidate) => candidate.id === requestedTaskId)) {
    return requestedTaskId;
  }
  const planned = candidates.find((candidate) => candidate.inTodayPlan);
  return planned?.id ?? candidates[0]?.id ?? "";
}

export function findReadyToCompletePlanTasks(plan: Pick<Plan, "status" | "tasks"> | null): PlanTask[] {
  if (!plan || plan.status !== "active") return [];
  return plan.tasks.filter(
    (task) => !task.completedAt && task.requiredFocusMinutes > 0 && task.focusDone >= task.requiredFocusMinutes,
  );
}
