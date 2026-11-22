"use client";

import { Check, Loader2, Square, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { cancelFocusAction, completeFocusAction } from "@/lib/actions/focus";
import { formatClock, formatMinutes } from "@/lib/data/format";
import type { FocusSession } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressRing } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";

export function FocusTimer({
  session,
  minValidMinutes,
}: {
  session: FocusSession;
  minValidMinutes: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const plannedSeconds = Math.max(60, session.plannedMinutes * 60);
  const elapsedSeconds = Math.max(
    0,
    Math.floor((now - new Date(session.startedAt).getTime()) / 1000),
  );
  const progress = Math.min(100, (elapsedSeconds / plannedSeconds) * 100);
  const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
  const willBeValid = elapsedSeconds >= minValidMinutes * 60;

  function performComplete() {
    startTransition(async () => {
      const result = await completeFocusAction(session.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
      setConfirmEndOpen(false);
    });
  }

  function endSession() {
    if (!willBeValid) {
      setConfirmEndOpen(true);
      return;
    }
    performComplete();
  }

  function performCancel() {
    startTransition(async () => {
      const result = await cancelFocusAction(session.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("info", result.success);
      setConfirmCancelOpen(false);
    });
  }

  return (
    <div className="surface-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <p className="text-[12px] font-medium">Focus session running</p>
        </div>
        <p className="text-[11px] text-muted">
          {session.mode === "pomodoro_25_5"
            ? "Pomodoro 25 / 5"
            : session.mode === "pomodoro_50_10"
              ? "Deep block 50 / 10"
              : "Custom block"}{" "}
          · {session.plannedMinutes} min planned
        </p>
      </div>

      <div className="flex flex-col items-center px-6 py-10 sm:py-12">
        <ProgressRing value={progress} size={248} stroke={9}>
          <p className="label-xs text-muted">Focused for</p>
          <p className="mt-2 font-display text-[60px] leading-none tracking-[-0.03em] tabular-nums">
            {formatClock(elapsedSeconds)}
          </p>
          <p className="mt-2 text-[11px] text-muted">
            {Math.floor(elapsedSeconds / 60)} / {session.plannedMinutes} min
          </p>
        </ProgressRing>

        <div className="mt-7 max-w-sm text-center">
          <p className="text-[15px] font-medium">{session.taskTitle ?? "Free focus"}</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
            {willBeValid
              ? "This session is long enough to count. End it whenever you are ready."
              : `Minimum valid block is ${formatMinutes(minValidMinutes)}. Keep going to make it count.`}
          </p>
        </div>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={endSession} disabled={pending} variant="accent" size="lg">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            End &amp; log session
          </Button>
          <Button
            onClick={() => setConfirmCancelOpen(true)}
            disabled={pending}
            variant="ghost"
            size="lg"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
            Cancel
          </Button>
        </div>

        <p className="mt-5 flex items-center gap-1.5 text-[10.5px] text-muted">
          <Square className="size-2.5" /> Leave this tab if you must — the timer runs on the server
          start time.
        </p>
      </div>

      <ConfirmDialog
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={performComplete}
        eyebrow="Short session"
        title="End before minimum threshold?"
        description={`You have focused for ${formatMinutes(elapsedMinutes)}. Sessions under ${formatMinutes(minValidMinutes)} are saved to your history, but do not count toward today's plan requirements.`}
        confirmLabel="End anyway"
        cancelLabel="Keep focusing"
        confirmVariant="primary"
        pending={pending}
      />

      <ConfirmDialog
        open={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={performCancel}
        eyebrow="Cancel session"
        title="Discard this focus block?"
        description="Cancelling stops the clock immediately and logs 0 minutes toward your tasks or daily focus total."
        confirmLabel="Discard session"
        cancelLabel="Keep focusing"
        confirmVariant="danger"
        pending={pending}
      />
    </div>
  );
}
