"use client";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  cancelFocusAction,
  completeFocusAction,
  type FocusCompletionActionResult,
} from "@/lib/actions/focus";
import { formatMinutes } from "@/lib/data/format";
import type { FocusSession } from "@/lib/data/types";
import {
  computeFocusTimerState,
  formatFocusModeLabel,
} from "@/lib/domain/focus-timer-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressRing } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type SubmissionState =
  | { status: "idle" }
  | { status: "verifying" }
  | { status: "error"; message: string }
  | {
      status: "verified";
      verification: NonNullable<FocusCompletionActionResult["verification"]>;
      message: string;
    };

export function FocusTimer({
  session,
  minValidMinutes,
}: {
  session: FocusSession;
  minValidMinutes: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [keepFocusingOvertime, setKeepFocusingOvertime] = useState(false);
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const inFlightRef = useRef(false);
  const toast = useToast();

  // Always derive elapsed time from the authoritative server `startedAt` timestamp.
  // Refreshing the clock on `visibilitychange` and `focus` ensures instant recovery
  // after tab backgrounding, browser throttling, or system sleep.
  useEffect(() => {
    const syncClock = () => setNow(Date.now());
    syncClock();

    const interval = window.setInterval(syncClock, 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") syncClock();
    };

    window.addEventListener("focus", syncClock);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", syncClock);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session.startedAt]);

  const timerState = computeFocusTimerState({
    startedAtIso: session.startedAt,
    nowMs: now,
    plannedMinutes: session.plannedMinutes,
    minValidMinutes,
    keepFocusingOvertime,
  });

  const isBusy = pending || submission.status === "verifying";

  function performComplete() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSubmission({ status: "verifying" });

    startTransition(async () => {
      try {
        const result = await completeFocusAction(session.id);
        if (result.error) {
          setSubmission({ status: "error", message: result.error });
          toast.push("error", result.error);
          setConfirmEndOpen(false);
          return;
        }

        if (result.verification) {
          const message =
            result.success ??
            (result.verification.isValid
              ? `Session verified — ${result.verification.creditedMinutes}m credited.`
              : "Session ended below minimum valid duration.");
          setSubmission({
            status: "verified",
            verification: result.verification,
            message,
          });
          toast.push(result.verification.isValid ? "success" : "info", message);
        } else if (result.success) {
          toast.push("success", result.success);
        }
        setConfirmEndOpen(false);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Network error while verifying session. Your session is safe — please retry.";
        setSubmission({ status: "error", message });
        toast.push("error", message);
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  function endSession() {
    if (isBusy) return;
    if (!timerState.meetsMinimumThreshold) {
      setConfirmEndOpen(true);
      return;
    }
    performComplete();
  }

  function performCancel() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    startTransition(async () => {
      try {
        const result = await cancelFocusAction(session.id);
        if (result.error) {
          setSubmission({ status: "error", message: result.error });
          toast.push("error", result.error);
        } else if (result.success) {
          toast.push("info", result.success);
        }
        setConfirmCancelOpen(false);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Could not cancel session due to a network error. Please try again.";
        setSubmission({ status: "error", message });
        toast.push("error", message);
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  const headerDotTone =
    timerState.phase === "credit_limit_reached"
      ? "bg-warning"
      : timerState.phase === "target_reached" || timerState.phase === "overtime"
        ? "bg-success"
        : "bg-accent";

  return (
    <div className="surface-card overflow-hidden">
      {/* Top Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-7">
        <div className="flex items-center gap-2.5">
          <span className="relative flex size-2">
            <span
              className={cn(
                "absolute inline-flex size-full animate-ping rounded-full opacity-60",
                headerDotTone,
              )}
            />
            <span className={cn("relative inline-flex size-2 rounded-full", headerDotTone)} />
          </span>
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-ink">
            {timerState.statusHeader}
          </p>
          {timerState.phase === "target_reached" ? (
            <Badge tone="success">Planned target met</Badge>
          ) : timerState.phase === "overtime" ? (
            <Badge tone="accent">Overtime</Badge>
          ) : timerState.phase === "credit_limit_reached" ? (
            <Badge tone="warning">Max credit cap ({formatMinutes(timerState.maxCreditedMinutes)})</Badge>
          ) : null}
        </div>
        <p className="text-[11.5px] text-muted tabular-nums">
          {formatFocusModeLabel(session.mode)} · {session.plannedMinutes} min planned (max{" "}
          {timerState.maxCreditedMinutes}m credit)
        </p>
      </div>

      {/* Main Clock Area */}
      <div className="flex flex-col items-center px-6 py-9 sm:py-11">
        <ProgressRing
          value={timerState.ringProgress}
          size={252}
          stroke={9}
          label={`${timerState.ringLabel}: ${timerState.clockDisplay}`}
        >
          <p className="label-xs text-muted">{timerState.ringLabel}</p>
          <p className="mt-2 font-display text-[60px] leading-none tracking-[-0.03em] tabular-nums">
            {timerState.clockDisplay}
          </p>
          <p className="mt-2 text-[11.5px] font-medium text-ink-soft tabular-nums">
            {timerState.subLabel}
          </p>
        </ProgressRing>

        {/* Task & Authoritative State Banner */}
        <div className="mt-7 w-full max-w-md text-center">
          <p className="text-[16px] font-semibold text-ink">
            {session.taskTitle ?? "Free focus"}
          </p>

          {submission.status === "verifying" ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center justify-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-3 text-left text-[12px] text-ink"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
              <div>
                <p className="font-semibold text-accent">Verifying focus session with server…</p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  Calculating authoritative elapsed time and credited minutes.
                </p>
              </div>
            </div>
          ) : submission.status === "verified" ? (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mt-3 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-left text-[12px]",
                submission.verification.isValid
                  ? "border-success/30 bg-success-soft text-success"
                  : "border-warning/30 bg-warning-soft text-warning",
              )}
            >
              {submission.verification.isValid ? (
                <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              ) : (
                <ShieldAlert className="mt-0.5 size-4 shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {submission.verification.isValid
                    ? `Backend verified: ${submission.verification.creditedMinutes}m credited (${submission.verification.actualMinutes}m actual)`
                    : `Session not eligible for credit (${submission.verification.actualMinutes}m actual)`}
                </p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed">{submission.message}</p>
              </div>
            </div>
          ) : submission.status === "error" ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-left text-[12px] text-danger"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Verification could not complete</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed">{submission.message}</p>
              </div>
            </div>
          ) : (
            <div
              role="status"
              aria-live="polite"
              className={cn(
                "mt-3 rounded-xl border px-4 py-3 text-left text-[12px]",
                timerState.bannerTone === "warning"
                  ? "border-warning/35 bg-warning-soft/80 text-ink"
                  : timerState.bannerTone === "success"
                    ? "border-success/35 bg-success-soft/80 text-ink"
                    : timerState.bannerTone === "accent"
                      ? "border-accent/25 bg-accent-soft/50 text-ink"
                      : "border-line bg-surface-2/60 text-ink-soft",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{timerState.bannerTitle}</p>
                <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-soft tabular-nums">
                  Est. credit: {formatMinutes(timerState.projectedCreditedMinutes)}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-soft">
                {timerState.bannerMessage}
              </p>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          <Button onClick={endSession} disabled={isBusy} variant="accent" size="lg">
            {isBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {submission.status === "error"
              ? "Retry end & log session"
              : submission.status === "verifying"
                ? "Verifying…"
                : "End & log session"}
          </Button>

          {timerState.phase === "target_reached" && !keepFocusingOvertime ? (
            <Button
              onClick={() => setKeepFocusingOvertime(true)}
              disabled={isBusy}
              variant="outline"
              size="lg"
            >
              <Play className="size-3.5" />
              Keep focusing
            </Button>
          ) : null}

          {submission.status === "error" ? (
            <Button
              onClick={() => setSubmission({ status: "idle" })}
              disabled={isBusy}
              variant="outline"
              size="lg"
            >
              <RotateCcw className="size-3.5" />
              Dismiss error
            </Button>
          ) : null}

          <Button
            onClick={() => setConfirmCancelOpen(true)}
            disabled={isBusy}
            variant="ghost"
            size="lg"
          >
            <X className="size-4" />
            Cancel
          </Button>
        </div>

        <p className="mt-5 flex items-center gap-1.5 text-[11px] text-muted">
          <Clock3 className="size-3" />
          <span>
            Elapsed time is anchored to the server start timestamp. Refreshing or switching tabs
            will not lose progress.
          </span>
        </p>
      </div>

      <ConfirmDialog
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={performComplete}
        eyebrow="Short session"
        title="End before minimum threshold?"
        description={`You have focused for ${formatMinutes(Math.max(0, timerState.elapsedMinutes))}. Sessions under ${formatMinutes(minValidMinutes)} are saved to your history, but earn 0 credited minutes toward today's plan requirements.`}
        confirmLabel="End anyway (0m credit)"
        cancelLabel="Keep focusing"
        confirmVariant="primary"
        pending={isBusy}
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
        pending={isBusy}
      />
    </div>
  );
}
