"use client";

import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Loader2,
  Plus,
  Timer,
} from "lucide-react";
import { useState, useTransition } from "react";
import { completePlanTaskAction } from "@/lib/actions/planner";
import { quickAddTodayTaskAction } from "@/lib/actions/v5";
import { formatMinutes } from "@/lib/data/format";
import type { PlanStatus, PlanTask } from "@/lib/data/types";
import { KindBadge } from "@/components/domain/labels";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function MissionInteractiveChecklist({
  tasks,
  planStatus,
  estimatedReward,
  locale = "en",
}: {
  tasks: PlanTask[];
  planStatus: PlanStatus;
  estimatedReward: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [expanded, setExpanded] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [optimisticDone, setOptimisticDone] = useState<Record<string, boolean>>({});
  const [quickTitle, setQuickTitle] = useState("");
  const [pendingAdd, startAddTransition] = useTransition();
  const [, startCompleteTransition] = useTransition();
  const toast = useToast();

  // Sort unfinished tasks first so actionable items are always at the top
  const sortedTasks = [...tasks].sort((a, b) => {
    const aDone = Boolean(a.completedAt) || a.status === "completed" || optimisticDone[a.id];
    const bDone = Boolean(b.completedAt) || b.status === "completed" || optimisticDone[b.id];
    if (aDone !== bDone) return aDone ? 1 : -1;
    return 0;
  });

  const visibleTasks = expanded ? sortedTasks : sortedTasks.slice(0, 5);
  const doneCount = tasks.filter(
    (t) => Boolean(t.completedAt) || t.status === "completed" || optimisticDone[t.id],
  ).length;
  const canCompleteDirectly = planStatus === "active" || planStatus === "confirmed" || planStatus === "draft";

  const handleComplete = (task: PlanTask) => {
    if (!canCompleteDirectly || busyTaskId) return;
    setBusyTaskId(task.id);
    setOptimisticDone((prev) => ({ ...prev, [task.id]: true }));
    startCompleteTransition(async () => {
      const res = await completePlanTaskAction(task.id);
      setBusyTaskId(null);
      if (res.error) {
        setOptimisticDone((prev) => ({ ...prev, [task.id]: false }));
        toast.push("error", res.error);
      } else {
        toast.push(
          "success",
          isVi ? `Đã hoàn thành "${task.title}"!` : `Completed "${task.title}"!`,
        );
      }
    });
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickTitle.trim();
    if (!title) return;
    startAddTransition(async () => {
      const res = await quickAddTodayTaskAction(title);
      if (res.error) toast.push("error", res.error);
      else {
        setQuickTitle("");
        toast.push("success", isVi ? `Đã thêm "${title}" vào hôm nay.` : `Added "${title}" to today.`);
      }
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
        <span>
          {isVi ? "Nhiệm vụ đã cam kết (" : "Committed tasks ("}
          <strong className="text-ink">{doneCount}</strong> / {tasks.length}{" "}
          {isVi ? "xong · bấm vào ô tròn để hoàn thành)" : "done · click circle to complete)"}
        </span>
        <span className="tabular-nums">
          {isVi ? "Thưởng ước tính:" : "Est. reward:"} {formatMinutes(estimatedReward)}
        </span>
      </div>

      <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {visibleTasks.map((task) => {
          const done =
            Boolean(task.completedAt) || task.status === "completed" || optimisticDone[task.id];
          const taskFocusLeft = Math.max(0, task.requiredFocusMinutes - task.focusDone);
          const needsFocusFirst = !done && taskFocusLeft > 0;
          const isBusy = busyTaskId === task.id;

          return (
            <li
              key={task.id}
              className="group flex items-center gap-3 px-3.5 py-2.5 text-[13px] transition-colors hover:bg-surface-2/45"
            >
              {done ? (
                <CheckCircle2 className="fg-animate-check size-4.5 shrink-0 text-success" strokeWidth={2.2} />
              ) : needsFocusFirst ? (
                <Link
                  href={`/focus?taskId=${task.taskId}`}
                  title={
                    isVi
                      ? `Cần ${formatMinutes(taskFocusLeft)} tập trung trước — bấm để vào Focus`
                      : `Needs ${formatMinutes(taskFocusLeft)} focus first — click to focus`
                  }
                  className="flex size-5 shrink-0 items-center justify-center rounded-full border border-accent/40 text-accent transition-colors hover:bg-accent hover:text-white"
                >
                  <Timer className="size-3" />
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={isBusy || !canCompleteDirectly}
                  onClick={() => handleComplete(task)}
                  title={isVi ? "Bấm để đánh dấu hoàn thành ngay" : "Click to mark complete"}
                  className="flex size-5 shrink-0 items-center justify-center rounded-full text-muted/75 transition-all hover:scale-110 hover:text-success disabled:opacity-50"
                >
                  {isBusy ? (
                    <Loader2 className="size-4 animate-spin text-accent" />
                  ) : (
                    <Circle className="size-4.5" strokeWidth={1.9} />
                  )}
                </button>
              )}

              <span
                onClick={() => {
                  if (!done && !needsFocusFirst && canCompleteDirectly) handleComplete(task);
                }}
                className={cn(
                  "min-w-0 flex-1 truncate",
                  done
                    ? "text-muted line-through"
                    : !needsFocusFirst && canCompleteDirectly
                      ? "cursor-pointer font-medium text-ink hover:text-accent"
                      : "font-medium text-ink",
                )}
              >
                {task.title}
              </span>

              {!done && task.requiredFocusMinutes > 0 ? (
                <Link
                  href={`/focus?taskId=${task.taskId}`}
                  className="hidden shrink-0 text-[11px] text-muted tabular-nums hover:text-accent sm:inline"
                >
                  {taskFocusLeft > 0
                    ? isVi
                      ? `còn ${formatMinutes(taskFocusLeft)} tập trung`
                      : `${formatMinutes(taskFocusLeft)} focus left`
                    : isVi
                      ? "đủ giờ tập trung"
                      : "focus met"}
                </Link>
              ) : null}

              <KindBadge kind={task.kind} locale={locale} />
            </li>
          );
        })}
      </ul>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        {tasks.length > 5 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
          >
            {expanded ? (
              <>
                <ChevronUp className="size-3.5" />
                {isVi ? "Thu gọn danh sách" : "Show fewer tasks"}
              </>
            ) : (
              <>
                <ChevronDown className="size-3.5" />
                {isVi
                  ? `Xem thêm ${tasks.length - 5} nhiệm vụ khác hôm nay`
                  : `Show ${tasks.length - 5} more task${tasks.length - 5 === 1 ? "" : "s"}`}
              </>
            )}
          </button>
        ) : (
          <span />
        )}

        {planStatus !== "completed" && (
          <form onSubmit={handleQuickAdd} className="flex flex-1 items-center gap-1.5 sm:max-w-[280px]">
            <input
              type="text"
              value={quickTitle}
              onChange={(e) => setQuickTitle(e.target.value)}
              disabled={pendingAdd}
              placeholder={isVi ? "+ Thêm việc nhanh hôm nay..." : "+ Quick-add task to today..."}
              className="h-8 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink placeholder:text-muted/70 focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              disabled={pendingAdd || !quickTitle.trim()}
              className="inline-flex h-8 items-center justify-center rounded-lg bg-accent px-2.5 text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              aria-label="Add quick task"
            >
              {pendingAdd ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
