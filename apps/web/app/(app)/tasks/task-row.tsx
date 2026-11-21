"use client";

import { Check, Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";
import {
  completeTaskAction,
  deleteTaskAction,
  reopenTaskAction,
} from "@/lib/actions/tasks";
import { formatDate, relativeDue } from "@/lib/data/format";
import type { Task } from "@/lib/data/types";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { categoryLabels, priorityLabels } from "@/components/domain/labels";
import { cn } from "@/lib/utils";
import { TaskFormDialog } from "./task-form-dialog";

export function TaskRow({ task, timezone }: { task: Task; timezone: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const completed = task.status === "completed";
  const due = relativeDue(task.dueDate, timezone);
  const overdue = due?.includes("overdue") ?? false;

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
    if (!window.confirm(`Delete "${task.title}"? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  return (
    <div className="group flex items-start gap-3 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2/50 sm:px-6">
      <button
        type="button"
        onClick={toggleComplete}
        disabled={pending}
        aria-label={completed ? `Reopen ${task.title}` : `Complete ${task.title}`}
        aria-pressed={completed}
        className={cn(
          "mt-0.5 flex size-[21px] shrink-0 items-center justify-center rounded-md border transition-colors",
          completed
            ? "border-success bg-success text-white"
            : "border-line bg-surface hover:border-accent hover:text-accent",
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
          <p
            className={cn(
              "text-[13.5px] font-medium leading-snug",
              completed && "text-muted line-through",
            )}
          >
            {task.title}
          </p>
          {task.priority === "urgent" ? <Badge tone="danger">Urgent</Badge> : null}
          {task.priority === "high" ? <Badge tone="warning">High</Badge> : null}
        </div>

        {task.description ? (
          <p className="mt-1 line-clamp-1 text-[12px] leading-relaxed text-muted">{task.description}</p>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted">
          <span>{categoryLabels[task.category] ?? task.category}</span>
          <span aria-hidden>·</span>
          <span>{task.estimatedMinutes}m estimate</span>
          {task.requiredFocusMinutes > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span>{task.requiredFocusMinutes}m focus</span>
            </>
          ) : null}
          {due ? (
            <>
              <span aria-hidden>·</span>
              <span className={overdue ? "font-medium text-danger" : undefined}>{due}</span>
            </>
          ) : task.dueDate ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatDate(task.dueDate, undefined, timezone)}</span>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <span className="mr-1 hidden text-[10.5px] text-muted sm:inline">
          {priorityLabels[task.priority]}
        </span>
        <TaskFormDialog task={task} trigger="edit" />
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          aria-label={`Delete ${task.title}`}
          className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
