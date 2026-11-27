"use client";

import Link from "next/link";
import { ArrowRight, Check, Loader2, Play, Plus, Trash2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { addSuggestedTaskToTodayPlanAction } from "@/lib/actions/planner";
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
  updateTaskAction,
} from "@/lib/actions/tasks";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
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
  const [subtaskSummary, setSubtaskSummary] = useState<{ done: number; total: number } | null>(null);
  const toast = useToast();

  useEffect(() => {
    try {
      const raw = JSON.parse(
        window.localStorage.getItem(`focusgate:subtasks:${task.id}`) || "[]",
      ) as Array<{ done?: boolean }>;
      if (Array.isArray(raw) && raw.length > 0) {
        setSubtaskSummary({ done: raw.filter((s) => Boolean(s.done)).length, total: raw.length });
      }
    } catch {
      // ignore
    }
  }, [task.id, inspectorOpen]);
  const rowStatus = formatTaskRowStatus(task, timezone, locale);
  const { completed } = rowStatus;
  const ageDays = Math.floor(
    (Date.now() - new Date(task.createdAt).getTime()) / 86_400_000,
  );
  const isStale = !completed && Number.isFinite(ageDays) && ageDays >= 7;
  const effectiveRequiredFocus =
    task.requiredFocusMinutes === 0
      ? 0
      : (planTask?.requiredFocusMinutes ?? task.requiredFocusMinutes);
  const needsFocusInActivePlan =
    planStatus === "active" &&
    planTask !== null &&
    !completed &&
    effectiveRequiredFocus > 0 &&
    planTask.focusDone < effectiveRequiredFocus;
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
      if (result.error) {
        toast.push("error", result.error);
      } else if (result.success) {
        if (!completed) {
          toast.push("success", result.success, {
            label: isVi ? "Hoàn tác" : "Undo",
            onClick: () => {
              startTransition(async () => {
                await reopenTaskAction(task.id);
              });
            },
          });
        } else {
          toast.push("success", result.success);
        }
      }
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

  function cycleEstimate() {
    const steps = [15, 25, 45, 60];
    const nextIdx = (steps.indexOf(task.estimatedMinutes) + 1) % steps.length;
    const nextMins = steps[nextIdx] ?? 25;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", task.id);
      fd.set("title", task.title);
      fd.set("description", task.description ?? "");
      fd.set("category", task.category);
      fd.set("kind", task.kind);
      fd.set("priority", task.priority);
      fd.set("estimatedMinutes", String(nextMins));
      fd.set("requiredFocusMinutes", String(Math.min(task.requiredFocusMinutes, nextMins)));
      fd.set("dueDate", task.dueDate ? task.dueDate.slice(0, 10) : "");
      if (task.isDailyHabit) fd.set("isDailyHabit", "on");
      const res = await updateTaskAction(EMPTY_ACTION_STATE, fd);
      if (res.error) toast.push("error", res.error);
      else toast.push("success", isVi ? `Đã đổi ước tính thành ${nextMins}p.` : `Estimate set to ${nextMins}m.`);
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

  const kindAccentBorder =
    task.kind === "must_do"
      ? "border-l-2 border-l-accent/70"
      : task.kind === "should_do"
        ? "border-l-2 border-l-warning/60"
        : "border-l-2 border-l-success/60";

  const focusProgressPct =
    planTask && planTask.requiredFocusMinutes > 0
      ? Math.min(100, Math.round((planTask.focusDone / planTask.requiredFocusMinutes) * 100))
      : 0;

  return (
      <div
        className={cn(
          "group relative flex items-start gap-3 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2/55 sm:px-6",
          kindAccentBorder,
        )}
      >
        {focusProgressPct > 0 && !completed && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 left-0 h-[2px] bg-accent/65 transition-all"
            style={{ width: `${focusProgressPct}%` }}
          />
        )}
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
          {!completed ? (
            <Link
              href={`/focus?taskId=${task.id}`}
              title={isVi ? "Tập trung ngay cho việc này" : "Start focus on this task"}
              className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft/70 px-2 py-0.5 text-[10.5px] font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
            >
              ▶ {isVi ? "Focus" : "Focus"}
            </Link>
          ) : null}
          {isStale ? (
            <Badge tone="neutral">
              {isVi ? `Mở ${ageDays} ngày` : `Open ${ageDays}d`}
            </Badge>
          ) : null}
          {subtaskSummary ? (
            <Badge tone={subtaskSummary.done === subtaskSummary.total ? "success" : "neutral"}>
              {subtaskSummary.done}/{subtaskSummary.total} {isVi ? "bước nhỏ" : "subtasks"}
            </Badge>
          ) : null}
        </div>

        {task.description ? (
          <p className="mt-1 line-clamp-1 text-[12.5px] leading-relaxed text-muted">{task.description}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted">
          <span>{getCategoryLabel(task.category, locale)}</span>
          <span aria-hidden>·</span>
          <button
            type="button"
            disabled={pending}
            onClick={cycleEstimate}
            title={isVi ? "Bấm để đổi nhanh thời lượng (15→25→45→60p)" : "Click to cycle estimate (15→25→45→60m)"}
            className="rounded-md px-1 py-0.5 transition-colors hover:bg-surface-2 hover:text-accent"
          >
            {isVi ? `ước tính ${task.estimatedMinutes}m` : `${task.estimatedMinutes}m estimate`}
          </button>
          {planTask && effectiveRequiredFocus > 0 ? (
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
        {!completed && !needsFocusInActivePlan ? (
          <Link
            href={`/focus?taskId=${task.id}`}
            title={isVi ? "Bắt đầu tập trung 25p cho việc này" : "Start 25m focus for this task"}
            className="inline-flex h-8 items-center gap-1 rounded-lg border border-accent/25 bg-accent-soft/70 px-2 text-[11.5px] font-semibold text-accent opacity-90 transition-all hover:bg-accent hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <Play className="size-3 fill-current" />
            <span>{isVi ? "25p" : "25m"}</span>
          </Link>
        ) : null}
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
