import { formatClock, formatMinutes } from "../data/format.ts";
import type { FocusMode, Plan } from "../data/types.ts";

export const FOCUS_MODE_LABELS: Record<string, string> = {
  pomodoro_25_5: "Pomodoro 25/5",
  pomodoro_50_10: "Deep Work 50/10",
  deep_50_10: "Deep Work 50/10",
  custom: "Custom",
  open_ended: "Open-ended",
};

export function formatFocusModeLabel(mode: FocusMode | string): string {
  const mapped = FOCUS_MODE_LABELS[mode];
  if (mapped) return mapped;
  const cleaned = String(mode)
    .trim()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
  if (!cleaned) return "Custom";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export interface FocusStarterConfigEvaluation {
  minValidMinutes: number;
  minAllowedCustomMinutes: number;
  presets: {
    mode: "pomodoro_25_5" | "pomodoro_50_10";
    label: string;
    minutes: number;
    maxCreditedMinutes: number;
    hint: string;
    disabled: boolean;
    disabledReason: string | null;
  }[];
  anyPresetAvailable: boolean;
}

export function evaluateFocusStarterOptions(
  minValidMinutesInput: number,
): FocusStarterConfigEvaluation {
  const minValidMinutes = Math.max(1, Math.round(minValidMinutesInput));
  const minAllowedCustomMinutes = Math.max(5, Math.ceil(minValidMinutes / 2));

  const rawPresets: {
    mode: "pomodoro_25_5" | "pomodoro_50_10";
    label: string;
    minutes: number;
    hint: string;
  }[] = [
    { mode: "pomodoro_25_5", label: "Quick block", minutes: 25, hint: "25 focus · 5 rest" },
    { mode: "pomodoro_50_10", label: "Deep block", minutes: 50, hint: "50 focus · 10 rest" },
  ];

  const presets = rawPresets.map((preset) => {
    const maxCreditedMinutes = preset.minutes * 2;
    const disabled = maxCreditedMinutes < minValidMinutes;
    const disabledReason = disabled
      ? `Max credit is ${formatMinutes(maxCreditedMinutes)} (2× ${preset.minutes}m), below your ${formatMinutes(minValidMinutes)} minimum valid duration.`
      : null;

    return {
      ...preset,
      maxCreditedMinutes,
      disabled,
      disabledReason,
    };
  });

  return {
    minValidMinutes,
    minAllowedCustomMinutes,
    presets,
    anyPresetAvailable: presets.some((preset) => !preset.disabled),
  };
}

export type FocusTimerPhase =
  | "paused"
  | "below_min"
  | "focusing"
  | "target_reached"
  | "overtime"
  | "credit_limit_reached";

export interface FocusTimerComputedState {
  phase: FocusTimerPhase;
  statusHeader: string;
  ringLabel: string;
  clockDisplay: string;
  subLabel: string;
  ringProgress: number;
  ringTone: "accent" | "success" | "warning";
  elapsedSeconds: number;
  elapsedMinutes: number;
  plannedMinutes: number;
  minValidMinutes: number;
  maxCreditedMinutes: number;
  projectedCreditedMinutes: number;
  overtimeSeconds: number;
  isPaused: boolean;
  meetsMinimumThreshold: boolean;
  isImpossibleConfiguration: boolean;
  isTargetReached: boolean;
  isOvertime: boolean;
  isCreditLimitReached: boolean;
  bannerTone: "neutral" | "accent" | "success" | "warning";
  bannerTitle: string;
  bannerMessage: string;
}

/**
 * Pure, deterministic state calculator for FocusTimer based on server start timestamp
 * and the session's snapshotted `minValidMinutes`.
 *
 * Invariants enforced:
 * 1. Before the backend confirms completion, the UI must NEVER claim "This session is valid".
 * 2. `projectedCreditedMinutes` is ALWAYS 0 whenever `!meetsMinimumThreshold` OR
 *    when `isImpossibleConfiguration` (`maxCreditedMinutes < minValidMinutes`).
 * 3. If a legacy session has `maxCreditedMinutes < minValidMinutes`, reaching the credit cap
 *    cannot be mistaken for a valid session — it explicitly surfaces an impossible-threshold warning.
 */
export function computeFocusTimerState(input: {
  startedAtIso: string;
  nowMs: number;
  plannedMinutes: number;
  minValidMinutes: number;
  keepFocusingOvertime?: boolean;
  status?: "running" | "paused";
  pausedAtIso?: string | null;
  pausedSeconds?: number;
}): FocusTimerComputedState {
  const plannedMinutes = Math.max(1, Math.min(600, Math.round(input.plannedMinutes)));
  const minValidMinutes = Math.max(1, Math.round(input.minValidMinutes));
  const maxCreditedMinutes = plannedMinutes * 2;
  const isImpossibleConfiguration = maxCreditedMinutes < minValidMinutes;
  const isPaused = input.status === "paused";

  const startedMs = new Date(input.startedAtIso).getTime();
  const pausedAtMs = isPaused && input.pausedAtIso ? new Date(input.pausedAtIso).getTime() : NaN;
  const effectiveNowMs = Number.isFinite(pausedAtMs) ? pausedAtMs : input.nowMs;
  const priorPausedSeconds = Math.max(0, Math.round(input.pausedSeconds ?? 0));
  const rawDiffSeconds = Number.isFinite(startedMs)
    ? Math.floor((effectiveNowMs - startedMs) / 1000) - priorPausedSeconds
    : 0;
  const elapsedSeconds = Math.max(0, rawDiffSeconds);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  const minValidSeconds = minValidMinutes * 60;
  const plannedSeconds = plannedMinutes * 60;
  const maxCreditedSeconds = maxCreditedMinutes * 60;

  const meetsMinimumThreshold =
    !isImpossibleConfiguration && elapsedSeconds >= minValidSeconds;
  const isTargetReached = elapsedSeconds >= plannedSeconds;
  const isCreditLimitReached = elapsedSeconds >= maxCreditedSeconds;
  const overtimeSeconds = Math.max(0, elapsedSeconds - plannedSeconds);

  const ringProgress = Math.min(100, Math.max(0, (elapsedSeconds / plannedSeconds) * 100));

  // Guard for any legacy session whose minimum threshold exceeds its 2x credit cap:
  // It can never earn credit, so projectedCreditedMinutes is strictly 0 and the banner
  // explicitly explains why.
  if (isImpossibleConfiguration) {
    const phase: FocusTimerPhase = isPaused
      ? "paused"
      : isCreditLimitReached
        ? "credit_limit_reached"
        : "below_min";
    return {
      phase,
      statusHeader: isPaused
        ? "PAUSED"
        : isCreditLimitReached
          ? "FOCUS CREDIT LIMIT REACHED"
          : "FOCUSING",
      ringLabel: isPaused
        ? "Paused"
        : isCreditLimitReached
          ? "Credit limit reached"
          : "Below minimum",
      clockDisplay: formatClock(elapsedSeconds),
      subLabel: `${elapsedMinutes} / ${plannedMinutes} minutes (0m eligible)`,
      ringProgress,
      ringTone: "warning",
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      minValidMinutes,
      maxCreditedMinutes,
      projectedCreditedMinutes: 0,
      overtimeSeconds,
      isPaused,
      meetsMinimumThreshold: false,
      isImpossibleConfiguration: true,
      isTargetReached,
      isOvertime: isTargetReached,
      isCreditLimitReached,
      bannerTone: "warning",
      bannerTitle: `Minimum threshold (${formatMinutes(minValidMinutes)}) exceeds this session's ${formatMinutes(maxCreditedMinutes)} credit cap`,
      bannerMessage: `This legacy ${formatMinutes(plannedMinutes)} block caps credit at ${formatMinutes(maxCreditedMinutes)} (2× planned), so it cannot satisfy a ${formatMinutes(minValidMinutes)} minimum threshold. Cancel and start a block of at least ${formatMinutes(Math.ceil(minValidMinutes / 2))}.`,
    };
  }

  const projectedCreditedMinutes = meetsMinimumThreshold
    ? Math.min(Math.max(elapsedMinutes, minValidMinutes), maxCreditedMinutes)
    : 0;

  if (isPaused) {
    return {
      phase: "paused",
      statusHeader: "PAUSED",
      ringLabel: "Paused",
      clockDisplay: formatClock(elapsedSeconds),
      subLabel: `${elapsedMinutes} / ${plannedMinutes} minutes (timer frozen)`,
      ringProgress,
      ringTone: "warning",
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      minValidMinutes,
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      isPaused: true,
      meetsMinimumThreshold,
      isImpossibleConfiguration: false,
      isTargetReached,
      isOvertime: isTargetReached,
      isCreditLimitReached,
      bannerTone: "warning",
      bannerTitle: "Session paused",
      bannerMessage:
        "Paused time is tracked on the server and does not count toward verified focus. Resume when you are ready to continue.",
    };
  }

  let phase: FocusTimerPhase;
  if (isCreditLimitReached) {
    phase = "credit_limit_reached";
  } else if (!meetsMinimumThreshold) {
    // Even if elapsedSeconds >= plannedSeconds (e.g. planned=25m, minValid=50m, elapsed=30m),
    // the session has NOT met its minimum threshold yet! It must remain in `below_min`
    // with 0 projected credit until it reaches `minValidSeconds`.
    phase = "below_min";
  } else if (isTargetReached) {
    const pastTargetWindow = elapsedSeconds >= plannedSeconds + 60;
    phase = input.keepFocusingOvertime || pastTargetWindow ? "overtime" : "target_reached";
  } else {
    phase = "focusing";
  }

  if (phase === "below_min") {
    const subLabel = isTargetReached
      ? `${elapsedMinutes} / ${plannedMinutes} min (+${formatClock(overtimeSeconds)} toward ${minValidMinutes}m min)`
      : `${elapsedMinutes} / ${plannedMinutes} minutes`;

    return {
      phase,
      statusHeader: "FOCUSING",
      ringLabel: "Focusing",
      clockDisplay: formatClock(elapsedSeconds),
      subLabel,
      ringProgress,
      ringTone: "accent",
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      minValidMinutes,
      maxCreditedMinutes,
      projectedCreditedMinutes: 0,
      overtimeSeconds,
      isPaused: false,
      meetsMinimumThreshold: false,
      isImpossibleConfiguration: false,
      isTargetReached,
      isOvertime: isTargetReached,
      isCreditLimitReached,
      bannerTone: "neutral",
      bannerTitle: `Minimum ${formatMinutes(minValidMinutes)} required`,
      bannerMessage: isTargetReached
        ? `Planned ${formatMinutes(plannedMinutes)} reached, but your session requires ${formatMinutes(minValidMinutes)} total to qualify for focus credit. Keep going.`
        : `Keep going. Sessions under ${formatMinutes(minValidMinutes)} are saved to history but do not earn focus credit.`,
    };
  }

  if (phase === "focusing") {
    return {
      phase,
      statusHeader: "FOCUSING",
      ringLabel: "Focusing",
      clockDisplay: formatClock(elapsedSeconds),
      subLabel: `${elapsedMinutes} / ${plannedMinutes} minutes`,
      ringProgress,
      ringTone: "accent",
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      minValidMinutes,
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      isPaused: false,
      meetsMinimumThreshold: true,
      isImpossibleConfiguration: false,
      isTargetReached,
      isOvertime: false,
      isCreditLimitReached,
      bannerTone: "accent",
      bannerTitle: "Minimum focus duration reached",
      bannerMessage: `Keep going. You're making progress (${elapsedMinutes}m elapsed; verified by the server when you end the session).`,
    };
  }

  if (phase === "target_reached") {
    return {
      phase,
      statusHeader: "TARGET REACHED",
      ringLabel: "Target reached",
      clockDisplay: formatClock(elapsedSeconds),
      subLabel: `${elapsedMinutes} / ${plannedMinutes} minutes`,
      ringProgress: 100,
      ringTone: "success",
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      minValidMinutes,
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      isPaused: false,
      meetsMinimumThreshold: true,
      isImpossibleConfiguration: false,
      isTargetReached,
      isOvertime: false,
      isCreditLimitReached,
      bannerTone: "success",
      bannerTitle: "Minimum focus duration reached · Planned target complete",
      bannerMessage:
        "You've completed your planned focus session. End & log now to verify your credit, or keep focusing into overtime.",
    };
  }

  if (phase === "overtime") {
    return {
      phase,
      statusHeader: "OVERTIME",
      ringLabel: "Overtime",
      clockDisplay: formatClock(elapsedSeconds),
      subLabel: `${elapsedMinutes} / ${plannedMinutes} min (+${formatClock(overtimeSeconds)} overtime)`,
      ringProgress: 100,
      ringTone: "success",
      elapsedSeconds,
      elapsedMinutes,
      plannedMinutes,
      minValidMinutes,
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      isPaused: false,
      meetsMinimumThreshold: true,
      isImpossibleConfiguration: false,
      isTargetReached,
      isOvertime: true,
      isCreditLimitReached,
      bannerTone: "accent",
      bannerTitle: "Minimum focus duration reached · Overtime in progress",
      bannerMessage: `Your planned focus is complete. Additional focus time is being recorded (up to ${formatMinutes(maxCreditedMinutes)} max credit for a ${formatMinutes(plannedMinutes)} block).`,
    };
  }

  // phase === "credit_limit_reached"
  return {
    phase,
    statusHeader: "FOCUS CREDIT LIMIT REACHED",
    ringLabel: "Credit limit reached",
    clockDisplay: formatClock(elapsedSeconds),
    subLabel: `${formatClock(maxCreditedSeconds)} credited · ${elapsedMinutes}m elapsed`,
    ringProgress: 100,
    ringTone: "warning",
    elapsedSeconds,
    elapsedMinutes,
    plannedMinutes,
    minValidMinutes,
    maxCreditedMinutes,
    projectedCreditedMinutes: maxCreditedMinutes,
    overtimeSeconds,
    isPaused: false,
    meetsMinimumThreshold: true,
    isImpossibleConfiguration: false,
    isTargetReached,
    isOvertime: true,
    isCreditLimitReached: true,
    bannerTone: "warning",
    bannerTitle: `Focus credit limit reached (${formatMinutes(maxCreditedMinutes)} credited)`,
    bannerMessage:
      "Additional elapsed time will not increase the focus credit for this session. End & log session to save your verified progress.",
  };
}

// ---------------------------------------------------------------------------
// P1.1 — Action-Intent Preserving Submission State Machine (Complete vs Cancel)
// ---------------------------------------------------------------------------

export interface FocusVerificationSummary {
  sessionId: string;
  actualMinutes: number;
  creditedMinutes: number;
  plannedMinutes: number;
  minValidMinutes?: number;
  isValid: boolean;
  idempotent: boolean;
}

export type FocusSubmissionState =
  | { status: "idle" }
  | { status: "completing" }
  | { status: "cancelling" }
  | { status: "complete_error"; message: string }
  | { status: "cancel_error"; message: string }
  | {
      status: "verified";
      verification: FocusVerificationSummary;
      message: string;
    };

export interface FocusSubmissionUiLabels {
  isBusy: boolean;
  isCompleting: boolean;
  isCancelling: boolean;
  primaryCompleteLabel: string;
  cancelDialogConfirmLabel: string;
  retryTarget: "complete" | "cancel" | null;
}

export function getFocusSubmissionUiLabels(
  submission: FocusSubmissionState,
  pending = false,
): FocusSubmissionUiLabels {
  const isCompleting = submission.status === "completing";
  const isCancelling = submission.status === "cancelling";
  const isBusy = pending || isCompleting || isCancelling;

  const primaryCompleteLabel = isCompleting
    ? "Verifying session…"
    : submission.status === "complete_error"
      ? "Retry end & log session"
      : "End & log session";

  const cancelDialogConfirmLabel = isCancelling
    ? "Cancelling session…"
    : submission.status === "cancel_error"
      ? "Retry cancel session"
      : "Discard session";

  const retryTarget =
    submission.status === "complete_error"
      ? "complete"
      : submission.status === "cancel_error"
        ? "cancel"
        : null;

  return {
    isBusy,
    isCompleting,
    isCancelling,
    primaryCompleteLabel,
    cancelDialogConfirmLabel,
    retryTarget,
  };
}

/**
 * Pure coordinator for Complete and Cancel operations that preserves action intent,
 * prevents concurrent duplicate submissions via `inFlightRef`, keeps the relevant
 * dialog open on failure, and closes it only on success.
 */
export async function executeFocusCompleteFlow(params: {
  sessionId: string;
  inFlightRef: { current: boolean };
  setSubmission: (state: FocusSubmissionState) => void;
  setConfirmEndOpen: (open: boolean) => void;
  completeAction: (sessionId: string) => Promise<{
    error?: string;
    success?: string;
    verification?: FocusVerificationSummary;
  }>;
  onToast?: (tone: "success" | "info" | "error", message: string) => void;
}): Promise<FocusSubmissionState> {
  if (params.inFlightRef.current) {
    return { status: "completing" };
  }
  params.inFlightRef.current = true;
  const startingState: FocusSubmissionState = { status: "completing" };
  params.setSubmission(startingState);

  try {
    const result = await params.completeAction(params.sessionId);
    if (result.error) {
      const errState: FocusSubmissionState = {
        status: "complete_error",
        message: result.error,
      };
      params.setSubmission(errState);
      params.onToast?.("error", result.error);
      return errState;
    }

    if (result.verification) {
      const message =
        result.success ??
        (result.verification.isValid
          ? `Session verified — ${result.verification.creditedMinutes}m credited.`
          : "Session ended below minimum valid duration.");
      const verifiedState: FocusSubmissionState = {
        status: "verified",
        verification: result.verification,
        message,
      };
      params.setSubmission(verifiedState);
      params.setConfirmEndOpen(false);
      params.onToast?.(result.verification.isValid ? "success" : "info", message);
      return verifiedState;
    }

    const idleState: FocusSubmissionState = { status: "idle" };
    params.setSubmission(idleState);
    params.setConfirmEndOpen(false);
    if (result.success) params.onToast?.("success", result.success);
    return idleState;
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Network error while verifying session. Your session is safe — please retry.";
    const errState: FocusSubmissionState = { status: "complete_error", message };
    params.setSubmission(errState);
    params.onToast?.("error", message);
    return errState;
  } finally {
    params.inFlightRef.current = false;
  }
}

export async function executeFocusCancelFlow(params: {
  sessionId: string;
  inFlightRef: { current: boolean };
  setSubmission: (state: FocusSubmissionState) => void;
  setConfirmCancelOpen: (open: boolean) => void;
  cancelAction: (sessionId: string) => Promise<{
    error?: string;
    success?: string;
  }>;
  onToast?: (tone: "success" | "info" | "error", message: string) => void;
}): Promise<{ state: FocusSubmissionState; cancelled: boolean }> {
  if (params.inFlightRef.current) {
    return { state: { status: "cancelling" }, cancelled: false };
  }
  params.inFlightRef.current = true;
  const startingState: FocusSubmissionState = { status: "cancelling" };
  params.setSubmission(startingState);

  try {
    const result = await params.cancelAction(params.sessionId);
    if (result.error) {
      const errState: FocusSubmissionState = {
        status: "cancel_error",
        message: result.error,
      };
      params.setSubmission(errState);
      // Keep the Cancel confirmation dialog open so the user can retry Cancel directly
      params.setConfirmCancelOpen(true);
      params.onToast?.("error", result.error);
      return { state: errState, cancelled: false };
    }

    // Successful Cancel resets submission state to idle (never `verified`),
    // closes the cancel dialog, and logs 0 credit.
    const idleState: FocusSubmissionState = { status: "idle" };
    params.setSubmission(idleState);
    params.setConfirmCancelOpen(false);
    if (result.success) params.onToast?.("info", result.success);
    return { state: idleState, cancelled: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "Could not cancel session due to a network error. Please try again.";
    const errState: FocusSubmissionState = { status: "cancel_error", message };
    params.setSubmission(errState);
    params.setConfirmCancelOpen(true);
    params.onToast?.("error", message);
    return { state: errState, cancelled: false };
  } finally {
    params.inFlightRef.current = false;
  }
}

export interface FocusPageMetricsViewModel {
  validRateValue: string;
  validRateHint: string;
  validRateTone: "default" | "success";
  planFocusLeftValue: string;
  planFocusLeftHint: string;
  planFocusLeftTone: "default" | "success";
  gateConfigured: boolean;
  gateTitle: string;
  gateDescription: string;
  planFocusDone: number;
  planFocusRequired: number;
  planFocusRemaining: number;
  planFocusPercent: number;
}

export function buildFocusPageMetrics(input: {
  sessionsCount: number;
  validSessionsCount: number;
  minValidFocusMinutes: number;
  plan: Plan | null;
}): FocusPageMetricsViewModel {
  const hasCompletedSessions = input.sessionsCount > 0;
  const validRateNumber = hasCompletedSessions
    ? Math.round((input.validSessionsCount / input.sessionsCount) * 100)
    : null;

  const validRateValue = validRateNumber !== null ? `${validRateNumber}%` : "—";
  const validRateHint = hasCompletedSessions
    ? `${input.validSessionsCount} of ${input.sessionsCount} verified (min ${formatMinutes(input.minValidFocusMinutes)})`
    : "No completed sessions yet.";
  const validRateTone: "default" | "success" =
    validRateNumber !== null && validRateNumber >= 80 ? "success" : "default";

  const plan = input.plan;
  const hasMustDos = Boolean(plan && plan.progress.mustDoTotal > 0);
  const focusRequired = hasMustDos && plan ? plan.progress.focusRequired : 0;
  const focusDone = hasMustDos && plan ? plan.progress.focusDone : 0;
  const focusRemaining = hasMustDos ? Math.max(0, focusRequired - focusDone) : 0;

  let planFocusLeftValue: string;
  let planFocusLeftHint: string;
  let planFocusLeftTone: "default" | "success" = "default";

  if (!plan || !hasMustDos) {
    planFocusLeftValue = "Not configured";
    planFocusLeftHint = "Add Must-do tasks to establish today's focus target.";
    planFocusLeftTone = "default";
  } else if (focusRequired === 0) {
    planFocusLeftValue = "Not configured";
    planFocusLeftHint = `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} must-dos · no focus target set`;
    planFocusLeftTone = "default";
  } else {
    planFocusLeftValue = formatMinutes(focusRemaining);
    planFocusLeftHint = `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} must-dos done · ${formatMinutes(focusDone)}/${formatMinutes(focusRequired)} verified`;
    planFocusLeftTone = focusRemaining === 0 && focusDone >= focusRequired ? "success" : "default";
  }

  const planFocusPercent =
    hasMustDos && focusRequired > 0
      ? Math.min(100, Math.round((focusDone / focusRequired) * 100))
      : 0;

  return {
    validRateValue,
    validRateHint,
    validRateTone,
    planFocusLeftValue,
    planFocusLeftHint,
    planFocusLeftTone,
    gateConfigured: hasMustDos,
    gateTitle: "Not configured",
    gateDescription: "Add 1–5 Must-do tasks in your Planner.",
    planFocusDone: focusDone,
    planFocusRequired: focusRequired,
    planFocusRemaining: focusRemaining,
    planFocusPercent,
  };
}

export function formatSessionDurationSummary(session: {
  actualMinutes: number;
  creditedMinutes: number;
  isValid: boolean;
}): string {
  if (!session.isValid) {
    return `${session.actualMinutes} min elapsed · 0 min credited`;
  }
  if (session.creditedMinutes < session.actualMinutes) {
    return `${session.creditedMinutes} min credited (${session.actualMinutes} min elapsed)`;
  }
  return `${session.creditedMinutes} min credited`;
}
