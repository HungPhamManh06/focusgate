"use client";

import {
  AlertTriangle,
  Check,
  Clock3,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FocusSoundscape } from "@/components/focus-soundscape";
import { AmbientStudioBackdrop } from "@/components/domain/ambient-studio-backdrop";
import { FocusSanctuaryTools } from "@/components/domain/focus-sanctuary-tools";
import { DEBRIEF_STORAGE_KEY } from "@/components/domain/session-debrief-modal";
import type { SoundPreset } from "@/lib/domain/soundscapes";
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
  const isVi = useLocale() === "vi";
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const [keepFocusingOvertime, setKeepFocusingOvertime] = useState(false);
  const [submission, setSubmission] = useState<FocusSubmissionState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [zenControlsDimmed, setZenControlsDimmed] = useState(false);
  const [activeSound, setActiveSound] = useState<SoundPreset>("off");
  const [clockStyle, setClockStyle] = useState<"dial" | "flip" | "minimal">("dial");

  useEffect(() => {
    if (!zenMode) {
      setZenControlsDimmed(false);
      return;
    }
    let idleTimer = window.setTimeout(() => setZenControlsDimmed(true), 3000);
    const wake = () => {
      setZenControlsDimmed(false);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setZenControlsDimmed(true), 3000);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZenMode(false);
      else wake();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousemove", wake);
    window.addEventListener("pointerdown", wake);
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("pointerdown", wake);
    };
  }, [zenMode]);
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

  // Cross-device live sync: if Android/another client pauses, resumes, or completes this session, refresh UI.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/agent/focus-session", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          active: boolean;
          session?: { id: string; status: string } | null;
        };
        if (
          !data.active ||
          data.session?.id !== session.id ||
          data.session?.status !== optimisticSession.status
        ) {
          router.refresh();
        }
      } catch {
        // Ignore transient network errors during background sync.
      }
    };
    const timer = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session.id, optimisticSession.status, router]);

  const timerState = computeFocusTimerState({
    startedAtIso: session.startedAt,
    nowMs: now,
    plannedMinutes: session.plannedMinutes,
    minValidMinutes: effectiveMinValidMinutes,
    mode: session.mode,
    keepFocusingOvertime,
    status: optimisticSession.status,
    pausedAtIso: optimisticSession.pausedAt,
    pausedSeconds: optimisticSession.pausedSeconds,
  });

  // Dynamic Browser Tab Title synced with live Focus Clock
  useEffect(() => {
    const prevTitle = document.title;
    const prefix = optimisticSession.status === "paused" ? "⏸ " : "● ";
    const label = session.taskTitle || (isVi ? "Đang tập trung" : "Focusing");
    document.title = `${prefix}${timerState.clockDisplay} · ${label} | FocusGate`;
    return () => {
      document.title = prevTitle;
    };
  }, [timerState.clockDisplay, session.taskTitle, optimisticSession.status, isVi]);

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
        onToast: (tone, msg) => {
          toast.push(tone, msg);
          if (tone === "success") {
            try {
              const completedMins = Math.max(
                1,
                Math.round(timerState.elapsedSeconds / 60),
              );
              window.sessionStorage.setItem(
                DEBRIEF_STORAGE_KEY,
                JSON.stringify({
                  sessionId: session.id,
                  taskTitle: session.taskTitle ?? null,
                  minutes: completedMins,
                  completedAt: Date.now(),
                }),
              );
            } catch {
              // Ignore storage errors
            }
          }
        },
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
    <div
      className={cn(
        zenMode
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto text-[#f5eeee]"
          : "surface-card overflow-hidden",
      )}
    >
      {zenMode ? <AmbientStudioBackdrop preset={activeSound} /> : null}

      {/* Top Status Bar */}
      <div
        className={cn(
          "relative z-10 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7",
          zenMode ? "border-white/10 bg-black/20 backdrop-blur-sm" : "border-line",
        )}
      >
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
          <p
            className={cn(
              "text-[11.5px] font-semibold uppercase tracking-[0.08em]",
              zenMode ? "text-[#f5eeee]" : "text-ink",
            )}
          >
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
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 transition-opacity duration-500",
            zenMode && zenControlsDimmed ? "opacity-20 hover:opacity-100" : "opacity-100",
          )}
        >
          <p
            className={cn(
              "text-[11.5px] tabular-nums",
              zenMode ? "text-white/70" : "text-muted",
            )}
          >
            {session.mode === "open_ended"
              ? `${formatFocusModeLabel(session.mode)} · ${formatMinutes(effectiveMinValidMinutes)} min threshold`
              : `${formatFocusModeLabel(session.mode)} · ${session.plannedMinutes} min planned · ${formatMinutes(effectiveMinValidMinutes)} min threshold (max ${timerState.maxCreditedMinutes}m credit)`}
          </p>
          <button
            type="button"
            onClick={() => setZenMode((prev) => !prev)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
              zenMode
                ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
                : "border-line bg-surface-2 text-ink hover:border-accent/40 hover:text-accent",
            )}
          >
            {zenMode ? (
              <>
                <Minimize2 className="size-3.5" />
                {isVi ? "Thoát Studio (Esc)" : "Exit Studio (Esc)"}
              </>
            ) : (
              <>
                <Maximize2 className="size-3.5" />
                {isVi ? "Buồng lái Studio" : "Studio Mode"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Clock Area */}
      <div
        className={cn(
          "relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-9 sm:py-11",
        )}
      >
        {/* 3 Clock Style Switcher */}
        <FocusSanctuaryTools darkSurface={zenMode} />
        <div
          className={cn(
            "mb-5 mt-4 inline-flex gap-1 rounded-full border p-1 text-[11px] font-medium transition-opacity duration-500",
            zenMode ? "border-white/15 bg-white/5 text-white/75" : "border-line bg-surface-2/80 text-muted",
            zenMode && zenControlsDimmed ? "opacity-20 hover:opacity-100" : "opacity-100",
          )}
        >
          {(
            [
              { id: "dial", label: isVi ? "Vòng cung" : "Arc Dial" },
              { id: "flip", label: isVi ? "Đồng hồ lật" : "Flip Clock" },
              { id: "minimal", label: isVi ? "Tối giản" : "Minimal" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setClockStyle(opt.id)}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                clockStyle === opt.id
                  ? zenMode
                    ? "bg-white text-[#120c0d]"
                    : "bg-ink text-canvas"
                  : "hover:text-ink",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {clockStyle === "flip" ? (
          <div className="flex flex-col items-center">
            <p className="label-xs mb-3 text-muted">{timerState.ringLabel}</p>
            <div className="flex items-center gap-2.5">
              {timerState.clockDisplay.split(":").map((part, idx) => (
                <div key={idx} className="flex items-center gap-2.5">
                  <div className="relative flex h-[112px] w-[96px] items-center justify-center overflow-hidden rounded-2xl border border-line bg-[#181113] font-display text-[56px] leading-none text-[#faf7f5] shadow-lg tabular-nums">
                    <span>{part}</span>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-1/2 h-[1.5px] bg-black/45"
                    />
                  </div>
                  {idx < timerState.clockDisplay.split(":").length - 1 ? (
                    <span className="font-display text-[42px] text-accent">:</span>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="mt-3 text-[12px] font-medium text-ink-soft tabular-nums">
              {timerState.subLabel}
            </p>
            {timerState.meetsMinimumThreshold ? (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-success/35 bg-success-soft px-2.5 py-0.5 text-[11px] font-semibold text-success">
                ✓ {isVi ? "Đã đạt ngưỡng phiên hợp lệ" : "Verified threshold reached"}
              </span>
            ) : null}
            {session.mode !== "open_ended" &&
            session.plannedMinutes * 60 - timerState.elapsedSeconds > 0 &&
            session.plannedMinutes * 60 - timerState.elapsedSeconds <= 300 ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-2.5 py-0.5 text-[11px] font-semibold text-warning">
                ⏳ {isVi ? "Còn dưới 5 phút — chuẩn bị gói gọn" : "Under 5m left — wrap up cleanly"}
              </span>
            ) : null}
          </div>
        ) : clockStyle === "minimal" ? (
          <div className="flex flex-col items-center py-6">
            <p className="label-xs text-muted">{timerState.ringLabel}</p>
            <p className="mt-2 font-display text-[84px] leading-none tracking-[-0.04em] tabular-nums sm:text-[96px]">
              {timerState.clockDisplay}
            </p>
            <p className="mt-3 text-[12.5px] font-medium text-ink-soft tabular-nums">
              {timerState.subLabel}
            </p>
          </div>
        ) : (
        <div className="relative flex items-center justify-center">
          {/* Minimalist 12-point dial ticks */}
          <svg
            aria-hidden
            viewBox="0 0 280 280"
            className={cn(
              "pointer-events-none absolute size-[276px]",
              zenMode ? "text-white/20" : "text-line",
            )}
          >
            {Array.from({ length: 12 }, (_, i) => {
              const angle = (i * 30 * Math.PI) / 180;
              const x1 = 140 + Math.cos(angle) * 130;
              const y1 = 140 + Math.sin(angle) * 130;
              const x2 = 140 + Math.cos(angle) * 137;
              const y2 = 140 + Math.sin(angle) * 137;
              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="currentColor"
                  strokeWidth={i % 3 === 0 ? 2 : 1.2}
                  strokeLinecap="round"
                />
              );
            })}
          </svg>
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
        </div>
        )}

        {/* Task & Authoritative State Banner */}
        <div className="mt-7 w-full max-w-md text-center">
          <p className="text-[16px] font-semibold text-ink">
            {session.taskTitle ?? (isVi ? "Tập trung tự do" : "Free focus")}
          </p>

          {submission.status === "completing" ? (
            <div
              role="status"
              aria-live="polite"
              className="mt-3 flex items-center justify-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft/60 px-4 py-3 text-left text-[12px] text-ink"
            >
              <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
              <div>
                <p className="font-semibold text-accent">
                  {isVi ? "Đang xác thực phiên…" : "Verifying session…"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  {isVi
                    ? "Đang tính thời gian thực tế và số phút được cộng."
                    : "Calculating authoritative elapsed time and credited minutes."}
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
                <p className="font-semibold text-ink">
                  {isVi ? "Đang hủy phiên…" : "Cancelling session…"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-soft">
                  {isVi
                    ? "Đang hủy phiên tập trung hiện tại và không cộng phút."
                    : "Discarding active focus block without crediting minutes."}
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
                    ? isVi
                      ? `Máy chủ đã xác thực: +${submission.verification.creditedMinutes}m (thực tế ${submission.verification.actualMinutes}m)`
                      : `Backend verified: ${submission.verification.creditedMinutes}m credited (${submission.verification.actualMinutes}m actual)`
                    : isVi
                      ? `Phiên chưa đủ điều kiện cộng điểm (thực tế ${submission.verification.actualMinutes}m)`
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
                <p className="font-semibold">
                  {isVi ? "Không thể xác thực & hoàn thành phiên" : "Could not verify & complete session"}
                </p>
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
                <p className="font-semibold">
                  {isVi ? "Không thể hủy phiên" : "Could not cancel session"}
                </p>
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
                  {isVi ? "Ước tính:" : "Est. credit:"} {formatMinutes(timerState.projectedCreditedMinutes)}
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
                    {isVi ? "Tiếp tục" : "Resume"}
                  </>
                ) : (
                  <>
                    <Pause className="size-4" />
                    {isVi ? "Tạm dừng" : "Pause"}
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
                {isVi && uiLabels.primaryCompleteLabel === "End & complete"
                  ? "Kết thúc & hoàn thành"
                  : uiLabels.primaryCompleteLabel}
              </Button>

              {timerState.phase === "target_reached" && !keepFocusingOvertime ? (
                <Button
                  onClick={() => setKeepFocusingOvertime(true)}
                  disabled={uiLabels.isBusy}
                  variant="outline"
                  size="lg"
                >
                  <Play className="size-3.5" />
                  {isVi ? "Tiếp tục tập trung" : "Keep focusing"}
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
                  {isVi ? "Đóng lỗi" : "Dismiss error"}
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
                {uiLabels.isCancelling
                  ? isVi ? "Đang hủy phiên…" : "Cancelling session…"
                  : isVi ? "Hủy" : "Cancel"}
              </Button>
            </>
          )}
        </div>

        <FocusSoundscape onPresetChange={setActiveSound} darkSurface={zenMode} />

        <p className="mt-5 flex items-center gap-1.5 text-[11px] text-muted">
          <Clock3 className="size-3" />
          <span>
            {isVi
              ? `Thời gian được neo theo đồng hồ máy chủ. Ngưỡng hợp lệ tối thiểu cho phiên này là ${formatMinutes(effectiveMinValidMinutes)}.`
              : `Elapsed time is anchored to the server start timestamp. Minimum valid threshold is locked at ${formatMinutes(effectiveMinValidMinutes)} for this session.`}
          </span>
        </p>
      </div>

      {/* Short-Session End Confirmation Dialog */}
      <ConfirmDialog
        open={confirmEndOpen}
        onClose={() => setConfirmEndOpen(false)}
        onConfirm={performComplete}
        eyebrow={isVi ? "Phiên ngắn" : "Short session"}
        title={isVi ? "Kết thúc trước ngưỡng tối thiểu?" : "End before minimum threshold?"}
        description={
          isVi
            ? `Bạn đã tập trung ${formatMinutes(Math.max(0, timerState.elapsedMinutes))}. Phiên dưới ${formatMinutes(effectiveMinValidMinutes)} vẫn lưu vào lịch sử nhưng nhận 0 phút tính vào kế hoạch hôm nay.`
            : `You have focused for ${formatMinutes(Math.max(0, timerState.elapsedMinutes))}. Sessions under ${formatMinutes(effectiveMinValidMinutes)} are saved to your history, but earn 0 credited minutes toward today's plan requirements.`
        }
        confirmLabel={
          uiLabels.isCompleting
            ? isVi ? "Đang xác thực…" : "Verifying session…"
            : submission.status === "complete_error"
              ? isVi ? "Thử kết thúc lại" : "Retry end & log session"
              : isVi ? "Vẫn kết thúc (0m)" : "End anyway (0m credit)"
        }
        cancelLabel={isVi ? "Tiếp tục tập trung" : "Keep focusing"}
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
        eyebrow={isVi ? "Hủy phiên" : "Cancel session"}
        title={isVi ? "Bỏ phiên tập trung này?" : "Discard this focus block?"}
        description={
          isVi
            ? "Hủy sẽ dừng đồng hồ ngay lập tức và ghi nhận 0 phút cho nhiệm vụ hoặc tổng tập trung ngày."
            : "Cancelling stops the clock immediately and logs 0 minutes toward your tasks or daily focus total."
        }
        confirmLabel={
          isVi && uiLabels.cancelDialogConfirmLabel === "Discard session"
            ? "Hủy bỏ phiên"
            : uiLabels.cancelDialogConfirmLabel
        }
        cancelLabel={isVi ? "Tiếp tục tập trung" : "Keep focusing"}
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
