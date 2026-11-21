"use client";

import { Check, Loader2, Lock, X } from "lucide-react";
import { useTransition } from "react";
import { completePlanTaskAction, removePlanTaskAction } from "@/lib/actions/planner";
import type { PlanStatus, PlanTask } from "@/lib/data/types";
import { formatMinutes } from "@/lib/data/format";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function PlanTaskRow({
  task,
  planStatus,
}: {
  task: PlanTask;
  planStatus: PlanStatus;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const done = Boolean(task.completedAt);
  const remainingFocus = Math.max(0, task.requiredFocusMinutes - task.focusDone);
  const focusPercent =
    task.requiredFocusMinutes > 0
      ? Math.min(100, Math.round((task.focusDone / task.requiredFocusMinutes) * 100))
      : 100;
  const canComplete = planStatus === "active" && !done && remainingFocus === 0;

  function remove() {
    startTransition(async () => {
      const result = await removePlanTaskAction(task.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  function complete() {
    startTransition(async () => {
      const result = await completePlanTaskAction(task.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:px-6">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
          done
            ? "bg-success-soft text-success"
            : planStatus === "active"
              ? "bg-accent-soft text-accent"
              : "bg-surface-2 text-muted",
        )}
      >
        {done ? (
          <Check className="size-3.5" strokeWidth={2.6} />
        ) : planStatus === "draft" || planStatus === "confirmed" ? (
          <Lock className="size-3.5" strokeWidth={1.8} />
        ) : (
          <span className="size-1.5 rounded-full bg-current" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={cn("text-[13px] font-medium", done && "text-muted line-through")}>
            {task.title}
          </p>
          {task.priority === "urgent" ? <Badge tone="danger">Urgent</Badge> : null}
          {done ? <Badge tone="success">Done</Badge> : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <Progress
            value={focusPercent}
            tone={focusPercent >= 100 ? "success" : "accent"}
            className="max-w-[210px]"
          />
          <span className="whitespace-nowrap text-[10.5px] text-muted">
            {formatMinutes(task.focusDone)} / {formatMinutes(task.requiredFocusMinutes)} focus
          </span>
        </div>

        {planStatus === "active" && !done && remainingFocus > 0 ? (
          <p className="mt-1.5 text-[10.5px] text-warning">
            {formatMinutes(remainingFocus)} more verified focus needed to complete.
          </p>
        ) : null}
      </div>

      {planStatus === "draft" ? (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Remove ${task.title} from plan`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
        </button>
      ) : null}

      {planStatus === "active" && !done ? (
        <button
          type="button"
          onClick={complete}
          disabled={pending || !canComplete}
          title={canComplete ? "Mark complete" : `Needs ${formatMinutes(remainingFocus)} more focus`}
          aria-label={`Complete ${task.title}`}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-success-soft hover:text-success disabled:cursor-not-allowed disabled:opacity-35"
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}
