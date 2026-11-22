"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  cancelFocusAction,
  completeFocusAction,
  pauseFocusAction,
  resumeFocusAction,
} from "@/lib/actions/focus";
import { formatMinutes } from "@/lib/data/format";
import type { FocusSession } from "@/lib/data/types";
import {
  computeFocusTimerState,
  executeFocusCancelFlow,
  executeFocusCompleteFlow,
  formatFocusModeLabel,
  getFocusSubmissionUiLabels,
  type FocusSubmissionState,
} from "@/lib/domain/focus-timer-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProgressRing } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function FocusTimer({
  session,
  minValidMinutes,
}: {
  session: FocusSession;
  minValidMinutes: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [keepFocusingOvertime, setKeepFocusingOvertime] = useState(false);
  const [submission, setSubmission] = useState<FocusSubmissionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [optimisticSession, setOptimisticSession] = useState<{
    status: "running" | "paused";
    pausedAt: string | null;
    pausedSeconds: number;
  }>(() => ({
    status: session.status === "paused" ? "paused" : "running",
    pausedAt: session.pausedAt ?? null,
    pausedSeconds: session.pausedSeconds ?? 0,
  }));
  const inFlightRef = useRef(false);
  const pauseInFlightRef = useRef(false);
  const toast = useToast();

  useEffect(() => {
    setOptimisticSession({
      status: session.status === "paused" ? "paused" : "running",
      pausedAt: session.pausedAt ?? null,
      pausedSeconds: session.pausedSeconds ?? 0,
    });
  }, [session.status, session.pausedAt, session.pausedSeconds]);

  // Always use the session's snapshotted minValidMinutes (falling back to workspace setting
  // only if an older unmigrated object lacked the field). This guarantees a settings change
  // during an active session never silently shifts the active session's validity threshold.
  const effectiveMinValidMinutes = Math.max(
    1,
    session.minValidMinutes ?? minValidMinutes,
  );

  // Always derive elapsed time from the authoritative server `startedAt` timestamp.
  // While paused, freeze the clock at `pausedAt` and avoid background ticking.
  useEffect(() => {
    const syncClock = () => setNow(Date.now());
    syncClock();

    if (optimisticSession.status === "paused") return;

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
  }, [session.startedAt, optimisticSession.status]);

  const timerState = computeFocusTimerState({
    startedAtIso: session.startedAt,
    nowMs: now,
    plannedMinutes: session.plannedMinutes,
    minValidMinutes: effectiveMinValidMinutes,
    keepFocusingOvertime,
    status: optimisticSession.status,
    pausedAtIso: optimisticSession.pausedAt,
    pausedSeconds: optimisticSession.pausedSeconds,
  });

  const uiLabels = getFocusSubmissionUiLabels(submission, pending);

  function performComplete() {
    if (inFlightRef.current) return;
    startTransition(async () => {
      await executeFocusCompleteFlow({
        sessionId: session.id,
        inFlightRef,
        setSubmission,
        setConfirmEndOpen,
        completeAction: completeFocusAction,
        onToast: (tone, msg) => toast.push(tone, msg),
      });
    });
  }

  function endSession() {
    if (uiLabels.isBusy) return;
    if (!timerState.meetsMinimumThreshold && submission.status !== "complete_error") {
      setConfirmEndOpen(true);
      return;
    }
    performComplete();
  }

  function performCancel() {
    if (inFlightRef.current) return;
    startTransition(async () => {
      await executeFocusCancelFlow({
        sessionId: session.id,
        inFlightRef,
        setSubmission,
        setConfirmCancelOpen,
        cancelAction: cancelFocusAction,
        onToast: (tone, msg) => toast.push(tone, msg),
      });
    });
  }

  async function togglePauseResume() {
    if (uiLabels.isBusy || pauseInFlightRef.current) return;
    pauseInFlightRef.current = true;
    const prev = optimisticSession;
    const clickMs = Date.now();
    const isCurrentlyPaused = prev.status === "paused";

    // Instant optimistic transition so Pause/Resume responds in 0ms.
    if (isCurrentlyPaused) {
      const pausedAtMs = prev.pausedAt ? new Date(prev.pausedAt).getTime() : clickMs;
      const extraPause = Number.isFinite(pausedAtMs)
        ? Math.max(0, Math.floor((clickMs - pausedAtMs) / 1000))
        : 0;
      setNow(clickMs);
      setOptimisticSession({
        status: "running",
        pausedAt: null,
        pausedSeconds: prev.pausedSeconds + extraPause,
      });
    } else {
      setNow(clickMs);
      setOptimisticSession({
        status: "paused",
        pausedAt: new Date(clickMs).toISOString(),
        pausedSeconds: prev.pausedSeconds,
      });
    }

    try {
      const result = isCurrentlyPaused
        ? await resumeFocusAction(session.id)
        : await pauseFocusAction(session.id);
      if (result.error) {
        setOptimisticSession(prev);
        toast.push("error", result.error);
      } else if (result.status) {
        setOptimisticSession({
          status: result.status,
          pausedAt: result.pausedAt ?? null,
          pausedSeconds: result.pausedSeconds ?? prev.pausedSeconds,
        });
      }
    } catch {
      setOptimisticSession(prev);
      toast.push("error", "Could not update session state. Please try again.");
    } finally {
      pauseInFlightRef.current = false;
    }
  }

  const headerDotTone =
    timerState.isPaused ||
    timerState.phase === "credit_limit_reached" ||
    timerState.isImpossibleConfiguration
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
          {timerState.isPaused ? (
            <Badge tone="warning">Paused</Badge>
          ) : timerState.phase === "target_reached" ? (
            <Badge tone="success">Planned target met</Badge>
          ) : timerState.phase === "overtime" ? (
            <Badge tone="accent">Overtime</Badge>
          ) : timerState.phase === "credit_limit_reached" ? (
            <Badge tone="warning">
              Max credit cap ({formatMinutes(timerState.maxCreditedMinutes)})
            </Badge>
          ) : null}
        </div>
        <p className="text-[11.5px] text-muted tabular-nums">
          {formatFocusModeLabel(session.mode)} · {session.plannedMinutes} min planned ·{" "}
          {formatMinutes(effectiveMinValidMinutes)} min threshold (max{" "}
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

          {submission.status === "completing" ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center justify-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-3 text-left text-[12px] text-ink"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
              <div>
                <p className="font-semibold text-accent">Verifying session…</p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  Calculating authoritative elapsed time and credited minutes.
                </p>
              </div>
            </div>
          ) : submission.status === "cancelling" ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center justify-center gap-2.5 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left text-[12px] text-ink"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-ink-soft" />
              <div>
                <p className="font-semibold text-ink">Cancelling session…</p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  Discarding active focus block without crediting minutes.
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
          ) : submission.status === "complete_error" ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-left text-[12px] text-danger"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Could not verify &amp; complete session</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed">{submission.message}</p>
              </div>
            </div>
          ) : submission.status === "cancel_error" ? (
            <div
              role="alert"
              className="mt-3 flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-left text-[12px] text-danger"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Could not cancel session</p>
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

        {/* Action Controls — Independent retry paths for Complete vs Cancel */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {submission.status === "cancel_error" ? (
            <>
              <Button
                onClick={performCancel}
                disabled={uiLabels.isBusy}
                variant="danger"
                size="lg"
              >
                {uiLabels.isCancelling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                Retry cancel session
              </Button>
              <Button
                onClick={() => setSubmission({ status: "idle" })}
                disabled={uiLabels.isBusy}
                variant="outline"
                size="lg"
              >
                <RotateCcw className="size-3.5" />
                Dismiss error
              </Button>
            </>
          ) : (
            <>
              <Button
                onClick={togglePauseResume}
                disabled={uiLabels.isBusy}
                variant={timerState.isPaused ? "accent" : "outline"}
                size="lg"
              >
                {timerState.isPaused ? (
                  <>
                    <Play className="size-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="size-4" />
                    Pause
                  </>
                )}
              </Button>

              <Button
                onClick={endSession}
                disabled={uiLabels.isBusy}
                variant={timerState.isPaused ? "outline" : "accent"}
                size="lg"
              >
                {uiLabels.isCompleting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                {uiLabels.primaryCompleteLabel}
              </Button>

              {timerState.phase === "target_reached" && !keepFocusingOvertime ? (
                <Button
                  onClick={() => setKeepFocusingOvertime(true)}
                  disabled={uiLabels.isBusy}
                  variant="outline"
                  size="lg"
                >
                  <Play className="size-3.5" />
                  Keep focusing
                </Button>
              ) : null}

              {submission.status === "complete_error" ? (
                <Button
                  onClick={() => setSubmission({ status: "idle" })}
                  disabled={uiLabels.isBusy}
                  variant="outline"
                  size="lg"
                >
                  <RotateCcw className="size-3.5" />
                  Dismiss error
                </Button>
              ) : null}

              <Button
                onClick={() => setConfirmCancelOpen(true)}
                disabled={uiLabels.isBusy}
                variant="ghost"
                size="lg"
              >
                {uiLabels.isCancelling ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <X className="size-4" />
                )}
                {uiLabels.isCancelling ? "Cancelling session…" : "Cancel"}
              </Button>
            </>
          )}
        </div>

        <p className="mt-5 flex items-center gap-1.5 text-[11px] text-muted">
          <Clock3 className="size-3" />
          <span>
            Elapsed time is anchored to the server start timestamp. Minimum valid threshold is
            locked at {formatMinutes(effectiveMinValidMinutes)} for this session.
          </span>
        </p>
      </div>

      {/* Short-Session End Confirmation Dialog */}
      <ConfirmDialog
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={performComplete}
        eyebrow="Short session"
        title="End before minimum threshold?"
        description={`You have focused for ${formatMinutes(Math.max(0, timerState.elapsedMinutes))}. Sessions under ${formatMinutes(effectiveMinValidMinutes)} are saved to your history, but earn 0 credited minutes toward today's plan requirements.`}
        confirmLabel={
          uiLabels.isCompleting
            ? "Verifying session…"
            : submission.status === "complete_error"
              ? "Retry end & log session"
              : "End anyway (0m credit)"
        }
        cancelLabel="Keep focusing"
        confirmVariant="primary"
        pending={uiLabels.isCompleting}
      >
        {submission.status === "complete_error" ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[12px] text-danger"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{submission.message}</span>
          </div>
        ) : null}
      </ConfirmDialog>

      {/* Cancel Session Confirmation Dialog (stays open on cancel_error so user can retry Cancel directly) */}
      <ConfirmDialog
        open={confirmCancelOpen}
        onClose={() => setConfirmCancelOpen(false)}
        onConfirm={performCancel}
        eyebrow="Cancel session"
        title="Discard this focus block?"
        description="Cancelling stops the clock immediately and logs 0 minutes toward your tasks or daily focus total."
        confirmLabel={uiLabels.cancelDialogConfirmLabel}
        cancelLabel="Keep focusing"
        confirmVariant="danger"
        pending={uiLabels.isCancelling}
      >
        {submission.status === "cancel_error" ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[12px] text-danger"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{submission.message}</span>
          </div>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
