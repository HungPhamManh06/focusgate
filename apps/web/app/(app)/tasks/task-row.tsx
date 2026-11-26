"use client";

import Link from "next/link";
import { ArrowRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { addSuggestedTaskToTodayPlanAction } from "@/lib/actions/planner";
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
} from "@/lib/actions/tasks";
import { formatMinutes } from "@/lib/data/format";
import type { PlanStatus, PlanTask, Task } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { getCategoryLabel, getKindLabel } from "@/components/domain/labels";
import { HabitStreakStrip } from "@/components/domain/habit-streak-strip";
import { TaskInspectorDrawer } from "@/components/domain/task-inspector-drawer";
import { formatTaskRowStatus } from "@/lib/domain/tasks-planner-state";
import { cn } from "@/lib/utils";
import { TaskFormDialog } from "./task-form-dialog";

const CATEGORY_DOT_COLORS: Record<string, string> = {
  work: "bg-accent",
  study: "bg-indigo-500",
  health: "bg-success",
  personal: "bg-warning",
  finance: "bg-teal-500",
  other: "bg-muted",
};

export function TaskRow({
  task,
  timezone,
  planId = null,
  planStatus = null,
  planTask = null,
}: {
  task: Task;
  timezone: string;
  planId?: string | null;
  planStatus?: PlanStatus | null;
  planTask?: PlanTask | null;
}) {
  const locale = useLocale();
  const isVi = locale === "vi";
  const [pending, startTransition] = useTransition();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const toast = useToast();
  const rowStatus = formatTaskRowStatus(task, timezone, locale);
  const { completed } = rowStatus;
  const needsFocusInActivePlan =
    planStatus === "active" &&
    planTask !== null &&
    !completed &&
    planTask.requiredFocusMinutes > 0 &&
    planTask.focusDone < planTask.requiredFocusMinutes;
  const canAddToTodayPlan =
    !planTask &&
    !completed &&
    (planStatus === null ||
      planStatus === "draft" ||
      planStatus === "confirmed" ||
      planStatus === "active");

  function toggleComplete() {
    startTransition(async () => {
      const result = completed
        ? await reopenTaskAction(task.id)
        : await completeTaskAction(task.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
      setConfirmDeleteOpen(false);
    });
  }

  function addToTodayPlan() {
    startTransition(async () => {
      const result = await addSuggestedTaskToTodayPlanAction({
        planId,
        taskId: task.id,
        kind: task.kind,
      });
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  return (
      <div className="group flex items-start gap-3 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2/55 sm:px-6">
        <span
          aria-hidden
          title={getCategoryLabel(task.category, locale)}
          className={cn(
            "mt-2.5 size-2 shrink-0 rounded-full",
            CATEGORY_DOT_COLORS[task.category] ?? "bg-muted",
          )}
        />
      <button
        type="button"
        onClick={toggleComplete}
        disabled={pending || needsFocusInActivePlan}
        title={
          needsFocusInActivePlan && planTask
            ? isVi
              ? `Cần thêm ${formatMinutes(planTask.requiredFocusMinutes - planTask.focusDone)} tập trung trước`
              : `Needs ${formatMinutes(planTask.requiredFocusMinutes - planTask.focusDone)} more focus first`
            : undefined
        }
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={completed}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border transition-colors",
          completed
            ? "border-success bg-success text-white"
            : "border-line bg-surface hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-45",
          pending && "opacity-60",
        )}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : completed ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : null}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setInspectorOpen(true)}
            className={cn(
              "text-left text-[14px] font-medium leading-snug transition-colors hover:text-accent",
              completed && "text-muted line-through",
            )}
          >
            {task.title}
          </button>
          {rowStatus.showPriorityBadge && task.priority === "urgent" ? (
            <Badge tone="danger">{isVi ? "Khẩn cấp" : "Urgent"}</Badge>
          ) : null}
          {rowStatus.showPriorityBadge && task.priority === "high" ? (
            <Badge tone="warning">{isVi ? "Cao" : "High"}</Badge>
          ) : null}
          {planTask ? (
            <Badge tone="accent">
              {isVi ? "Trong kế hoạch hôm nay" : "In today's plan"} · {getKindLabel(planTask.kind, locale)}
            </Badge>
          ) : null}
          {task.isDailyHabit ? <HabitStreakStrip completedToday={completed} /> : null}
        </div>

        {task.description ? (
          <p className="mt-1 line-clamp-1 text-[12.5px] leading-relaxed text-muted">{task.description}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>{getCategoryLabel(task.category, locale)}</span>
          <span aria-hidden>·</span>
          <span>
            {isVi ? `ước tính ${task.estimatedMinutes}m` : `${task.estimatedMinutes}m estimate`}
          </span>
          {planTask && planTask.requiredFocusMinutes > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {formatMinutes(planTask.focusDone)}/{formatMinutes(planTask.requiredFocusMinutes)}{" "}
                {isVi ? "tập trung" : "focus"}
              </span>
            </>
          ) : task.requiredFocusMinutes > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>
                {task.requiredFocusMinutes}m {isVi ? "tập trung" : "focus"}
              </span>
            </>
          ) : null}
          {rowStatus.completedLabel ? (
            <>
              <span aria-hidden>·</span>
              <span>{rowStatus.completedLabel}</span>
            </>
          ) : rowStatus.dueLabel ? (
            <>
              <span aria-hidden>·</span>
              <span className={rowStatus.showOverdue ? "font-medium text-danger" : undefined}>
                {rowStatus.dueLabel}
              </span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {needsFocusInActivePlan ? (
          <Link
            href={`/focus?taskId=${task.id}`}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-accent/35 bg-accent-soft px-2.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent hover:text-white"
          >
            {isVi ? "Tập trung" : "Focus"} <ArrowRight className="size-3.5" />
          </Link>
        ) : canAddToTodayPlan ? (
          <button
            type="button"
            onClick={addToTodayPlan}
            disabled={pending}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface-2/70 px-2.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:bg-accent-soft hover:text-accent disabled:opacity-50"
          >
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">{isVi ? "Hôm nay" : "Today"}</span>
          </button>
        ) : null}
        <div className="flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100">
          <TaskFormDialog task={task} trigger="edit" />
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={pending}
            aria-label={`Delete ${task.title}`}
            className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      <TaskInspectorDrawer
        task={task}
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={remove}
        eyebrow={isVi ? "Xóa nhiệm vụ" : "Delete task"}
        title={isVi ? "Xóa nhiệm vụ này?" : "Remove this task?"}
        description={
          isVi ? (
            <>
              Bạn sắp xóa vĩnh viễn{" "}
              <span className="font-medium text-ink">&ldquo;{task.title}&rdquo;</span>. Hành động
              này không thể hoàn tác.
            </>
          ) : (
            <>
              You are about to permanently delete{" "}
              <span className="font-medium text-ink">&ldquo;{task.title}&rdquo;</span>. This action
              cannot be undone.
            </>
          )
        }
        confirmLabel={isVi ? "Xóa nhiệm vụ" : "Delete task"}
        confirmVariant="danger"
        pending={pending}
      />
    </div>
  );
}
