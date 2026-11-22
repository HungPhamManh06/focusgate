"use client";

import Link from "next/link";
import { ArrowRight, Check, FileEdit, Loader2, Lock, X } from "lucide-react";
import { useState, useTransition } from "react";
import {
  amendPlanTaskAction,
  completePlanTaskAction,
  removePlanTaskAction,
} from "@/lib/actions/planner";
import type { PlanStatus, PlanTask, TaskKind } from "@/lib/data/types";
import { formatMinutes } from "@/lib/data/format";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { kindLabels } from "@/components/domain/labels";
import { cn } from "@/lib/utils";

export function PlanTaskRow({
  task,
  planStatus,
}: {
  task: PlanTask;
  planStatus: PlanStatus;
}) {
  const [pending, startTransition] = useTransition();
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendKind, setAmendKind] = useState<TaskKind>(
    task.kind === "must_do" ? "should_do" : "must_do",
  );
  const [amendReason, setAmendReason] = useState("");
  const [amendError, setAmendError] = useState<string | null>(null);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const toast = useToast();

  const done = Boolean(task.completedAt);
  const remainingFocus = Math.max(0, task.requiredFocusMinutes - task.focusDone);
  const focusPercent =
    task.requiredFocusMinutes > 0
      ? Math.min(100, Math.round((task.focusDone / task.requiredFocusMinutes) * 100))
      : 100;
  const canComplete = planStatus === "active" && !done && remainingFocus === 0;
  const isCommitted = planStatus === "confirmed" || planStatus === "active";
  const requiresAuditReason = isCommitted && task.kind === "must_do" && amendKind !== "must_do";

  function remove() {
    startTransition(async () => {
      const result = await removePlanTaskAction(task.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
      setConfirmRemoveOpen(false);
    });
  }

  function changeDraftKind(nextKind: TaskKind) {
    if (nextKind === task.kind) return;
    startTransition(async () => {
      const result = await amendPlanTaskAction({
        planTaskId: task.id,
        newKind: nextKind,
      });
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  function submitAmendment() {
    if (requiresAuditReason && amendReason.trim().length < 5) {
      setAmendError("Please provide a brief reason (at least 5 characters) for the gate audit log.");
      return;
    }
    setAmendError(null);
    startTransition(async () => {
      const result = await amendPlanTaskAction({
        planTaskId: task.id,
        newKind: amendKind,
        reason: amendReason,
      });
      if (result.error) {
        setAmendError(result.error);
        toast.push("error", result.error);
      } else {
        if (result.success) toast.push("success", result.success);
        setAmendOpen(false);
        setAmendReason("");
      }
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
          <p className={cn("text-[14px] font-medium", done && "text-muted line-through")}>
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
          <span className="whitespace-nowrap text-[12px] text-muted">
            {formatMinutes(task.focusDone)} / {formatMinutes(task.requiredFocusMinutes)} focus
          </span>
        </div>

        {planStatus === "active" && !done && remainingFocus > 0 ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <p className="text-[12px] text-warning">
              {formatMinutes(remainingFocus)} more verified focus needed to complete.
            </p>
            <Link
              href={`/focus?taskId=${task.taskId}`}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
            >
              Focus <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : null}
      </div>

      {planStatus === "draft" ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={task.kind}
            onChange={(event) => changeDraftKind(event.target.value as TaskKind)}
            disabled={pending}
            aria-label={`Change gate tier for ${task.title}`}
            className="h-7 rounded-lg border border-line bg-surface-2 px-2 text-[11px] font-medium text-ink-soft transition-colors hover:border-ink/25 focus:border-accent focus:outline-none"
          >
            <option value="must_do">{kindLabels.must_do}</option>
            <option value="should_do">{kindLabels.should_do}</option>
            <option value="bonus">{kindLabels.bonus}</option>
          </select>
          <button
            type="button"
            onClick={() => setConfirmRemoveOpen(true)}
            disabled={pending}
            aria-label={`Remove ${task.title} from plan`}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRemoveOpen}
        onClose={() => setConfirmRemoveOpen(false)}
        onConfirm={remove}
        eyebrow="Draft plan"
        title="Remove from today's plan?"
        description={
          <>
            Remove <span className="font-medium text-ink">&ldquo;{task.title}&rdquo;</span> from
            today&apos;s plan? The task will remain in your backlog.
          </>
        }
        confirmLabel="Remove from plan"
        confirmVariant="danger"
        pending={pending}
      />

      {isCommitted && !done ? (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setAmendKind(task.kind === "must_do" ? "should_do" : "must_do");
              setAmendReason("");
              setAmendError(null);
              setAmendOpen(true);
            }}
            disabled={pending}
            title="Amend commitment tier (logged in gate history)"
            aria-label={`Amend ${task.title}`}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-surface-2/60 px-2 text-[10.5px] font-medium text-muted transition-colors hover:border-ink/20 hover:bg-surface-2 hover:text-ink"
          >
            <FileEdit className="size-3" />
            <span className="hidden sm:inline">Amend</span>
          </button>

          {planStatus === "active" ? (
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
      ) : null}

      <ConfirmDialog
        open={amendOpen}
        onClose={() => setAmendOpen(false)}
        onConfirm={submitAmendment}
        eyebrow="Audited plan amendment"
        title="Amend committed task?"
        description={
          <>
            Adjusting <span className="font-medium text-ink">&ldquo;{task.title}&rdquo;</span> after
            confirmation writes an immutable entry to today&apos;s Gate History.
          </>
        }
        confirmLabel={requiresAuditReason ? "Record exception & downgrade" : "Update tier"}
        confirmVariant="primary"
        pending={pending}
      >
        <div className="space-y-3 pt-1">
          {amendError ? (
            <p className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2 text-[11.5px] text-danger">
              {amendError}
            </p>
          ) : null}

          <div>
            <Label htmlFor={`amend-kind-${task.id}`}>New commitment tier</Label>
            <Select
              id={`amend-kind-${task.id}`}
              value={amendKind}
              onChange={(event) => setAmendKind(event.target.value as TaskKind)}
            >
              {task.kind !== "must_do" ? <option value="must_do">Must-do (locks reward gate)</option> : null}
              {task.kind !== "should_do" ? <option value="should_do">Should-do (does not block reward)</option> : null}
              {task.kind !== "bonus" ? <option value="bonus">Bonus (+extra reward minutes)</option> : null}
            </Select>
          </div>

          {requiresAuditReason ? (
            <div>
              <Label htmlFor={`amend-reason-${task.id}`}>Reason for exception (required)</Label>
              <Textarea
                id={`amend-reason-${task.id}`}
                value={amendReason}
                onChange={(event) => setAmendReason(event.target.value)}
                placeholder="e.g. Blocked by external dependency or unexpected urgent outage…"
                maxLength={300}
                required
              />
              <p className="mt-1 text-[10.5px] text-muted">
                Keep it honest — this reason appears in your permanent Gate History.
              </p>
            </div>
          ) : null}
        </div>
      </ConfirmDialog>
    </div>
  );
}
