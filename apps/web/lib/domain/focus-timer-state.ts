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

export type FocusTimerPhase =
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
  maxCreditedMinutes: number;
  projectedCreditedMinutes: number;
  overtimeSeconds: number;
  meetsMinimumThreshold: boolean;
  isTargetReached: boolean;
  isOvertime: boolean;
  isCreditLimitReached: boolean;
  bannerTone: "neutral" | "accent" | "success" | "warning";
  bannerTitle: string;
  bannerMessage: string;
}

/**
 * Pure, deterministic state calculator for FocusTimer based on server start timestamp.
 *
 * Notice on validity wording:
 * Before the backend confirms completion, the UI must NEVER claim "This session is valid".
 * Instead, once `elapsedSeconds >= minValidSeconds`, it states "Minimum focus duration reached"
 * and explains the projected credit subject to server verification.
 */
export function computeFocusTimerState(input: {
  startedAtIso: string;
  nowMs: number;
  plannedMinutes: number;
  minValidMinutes: number;
  keepFocusingOvertime?: boolean;
}): FocusTimerComputedState {
  const plannedMinutes = Math.max(1, Math.min(600, Math.round(input.plannedMinutes)));
  const minValidMinutes = Math.max(1, Math.round(input.minValidMinutes));
  const maxCreditedMinutes = plannedMinutes * 2;

  const startedMs = new Date(input.startedAtIso).getTime();
  const rawDiffSeconds = Number.isFinite(startedMs)
    ? Math.floor((input.nowMs - startedMs) / 1000)
    : 0;
  const elapsedSeconds = Math.max(0, rawDiffSeconds);
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);

  const minValidSeconds = minValidMinutes * 60;
  const plannedSeconds = plannedMinutes * 60;
  const maxCreditedSeconds = maxCreditedMinutes * 60;

  const meetsMinimumThreshold = elapsedSeconds >= minValidSeconds;
  const isTargetReached = elapsedSeconds >= plannedSeconds;
  const isCreditLimitReached = elapsedSeconds >= maxCreditedSeconds;
  const overtimeSeconds = Math.max(0, elapsedSeconds - plannedSeconds);

  // Within the target minute (or before clicking "Keep focusing" while under 1 min past target),
  // surface the explicit "Target Reached" state; beyond that (or when user clicks Keep focusing),
  // transition to Overtime, and finally Credit Limit Reached at 2x planned duration.
  let phase: FocusTimerPhase;
  if (isCreditLimitReached) {
    phase = "credit_limit_reached";
  } else if (isTargetReached) {
    const pastTargetWindow = elapsedSeconds >= plannedSeconds + 60;
    phase = input.keepFocusingOvertime || pastTargetWindow ? "overtime" : "target_reached";
  } else if (meetsMinimumThreshold) {
    phase = "focusing";
  } else {
    phase = "below_min";
  }

  const projectedCreditedMinutes = meetsMinimumThreshold
    ? Math.min(Math.max(elapsedMinutes, minValidMinutes), maxCreditedMinutes)
    : 0;

  const ringProgress = Math.min(100, Math.max(0, (elapsedSeconds / plannedSeconds) * 100));

  if (phase === "below_min") {
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
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      meetsMinimumThreshold,
      isTargetReached,
      isOvertime: false,
      isCreditLimitReached,
      bannerTone: "neutral",
      bannerTitle: `Minimum ${formatMinutes(minValidMinutes)} required`,
      bannerMessage: `Keep going. Sessions under ${formatMinutes(minValidMinutes)} are saved to history but do not earn focus credit.`,
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
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      meetsMinimumThreshold,
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
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      meetsMinimumThreshold,
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
      maxCreditedMinutes,
      projectedCreditedMinutes,
      overtimeSeconds,
      meetsMinimumThreshold,
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
    maxCreditedMinutes,
    projectedCreditedMinutes: maxCreditedMinutes,
    overtimeSeconds,
    meetsMinimumThreshold,
    isTargetReached,
    isOvertime: true,
    isCreditLimitReached: true,
    bannerTone: "warning",
    bannerTitle: `Focus credit limit reached (${formatMinutes(maxCreditedMinutes)} credited)`,
    bannerMessage:
      "Additional elapsed time will not increase the focus credit for this session. End & log session to save your verified progress.",
  };
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
