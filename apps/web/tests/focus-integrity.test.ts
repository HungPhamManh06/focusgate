import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFocusPageMetrics,
  computeFocusTimerState,
  formatFocusModeLabel,
  formatSessionDurationSummary,
} from "../lib/domain/focus-timer-state.ts";
import type { Plan } from "../lib/data/types.ts";

const STARTED_AT = "2026-11-22T06:00:00.000Z";
const STARTED_MS = new Date(STARTED_AT).getTime();

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-focus-test",
    planDate: "2026-11-22",
    status: "draft",
    confirmedAt: null,
    activatedAt: null,
    completedAt: null,
    tasks: [],
    events: [],
    progress: {
      mustDoTotal: 0,
      mustDoCompleted: 0,
      focusRequired: 0,
      focusDone: 0,
      bonusCompleted: 0,
    },
    ...overrides,
  };
}

test("B1: Timer below minimum duration shows below_min state and 0m projected credit", () => {
  const state = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 3 * 60 * 1000 + 15 * 1000, // 03:15
    plannedMinutes: 25,
    minValidMinutes: 5,
  });

  assert.equal(state.phase, "below_min");
  assert.equal(state.statusHeader, "FOCUSING");
  assert.equal(state.clockDisplay, "03:15");
  assert.equal(state.meetsMinimumThreshold, false);
  assert.equal(state.projectedCreditedMinutes, 0);
  assert.ok(!state.bannerTitle.toLowerCase().includes("this session is valid"));
});

test("B2 & B11: Timer at/above minimum duration says 'Minimum focus duration reached' and never prematurely claims 'This session is valid'", () => {
  const atMin = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 5 * 60 * 1000, // 05:00
    plannedMinutes: 25,
    minValidMinutes: 5,
  });

  assert.equal(atMin.phase, "focusing");
  assert.equal(atMin.statusHeader, "FOCUSING");
  assert.equal(atMin.clockDisplay, "05:00");
  assert.equal(atMin.subLabel, "5 / 25 minutes");
  assert.equal(atMin.meetsMinimumThreshold, true);
  assert.equal(atMin.projectedCreditedMinutes, 5);
  assert.equal(atMin.bannerTitle, "Minimum focus duration reached");
  assert.ok(!atMin.bannerTitle.toLowerCase().includes("this session is valid"));
  assert.ok(!atMin.bannerMessage.toLowerCase().includes("this session is valid"));

  const midSession = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + (18 * 60 + 24) * 1000, // 18:24
    plannedMinutes: 25,
    minValidMinutes: 5,
  });
  assert.equal(midSession.phase, "focusing");
  assert.equal(midSession.clockDisplay, "18:24");
  assert.equal(midSession.subLabel, "18 / 25 minutes");
  assert.equal(midSession.projectedCreditedMinutes, 18);
});

test("B3: Timer at planned duration transitions to TARGET REACHED with 100% ring progress", () => {
  const targetState = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 25 * 60 * 1000, // 25:00
    plannedMinutes: 25,
    minValidMinutes: 5,
  });

  assert.equal(targetState.phase, "target_reached");
  assert.equal(targetState.statusHeader, "TARGET REACHED");
  assert.equal(targetState.clockDisplay, "25:00");
  assert.equal(targetState.ringProgress, 100);
  assert.equal(targetState.isTargetReached, true);
  assert.equal(targetState.isOvertime, false);
  assert.equal(targetState.projectedCreditedMinutes, 25);
});

test("B4: Timer in overtime displays OVERTIME, records additional focus time up to 2x cap, and clamps ring at 100%", () => {
  // User clicks "Keep focusing" at 25:10 -> immediately transitions to overtime
  const manualOvertime = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + (25 * 60 + 10) * 1000,
    plannedMinutes: 25,
    minValidMinutes: 5,
    keepFocusingOvertime: true,
  });
  assert.equal(manualOvertime.phase, "overtime");
  assert.equal(manualOvertime.statusHeader, "OVERTIME");

  // At 32:15 (7m 15s past 25:00 target)
  const overtimeState = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + (32 * 60 + 15) * 1000, // 32:15
    plannedMinutes: 25,
    minValidMinutes: 5,
  });

  assert.equal(overtimeState.phase, "overtime");
  assert.equal(overtimeState.statusHeader, "OVERTIME");
  assert.equal(overtimeState.clockDisplay, "32:15");
  assert.equal(overtimeState.ringProgress, 100);
  assert.equal(overtimeState.isOvertime, true);
  assert.equal(overtimeState.isCreditLimitReached, false);
  assert.equal(overtimeState.projectedCreditedMinutes, 32);
  assert.ok(overtimeState.subLabel.includes("+07:15 overtime"));
});

test("B5: Timer at/beyond 2x planned duration transitions to FOCUS CREDIT LIMIT REACHED and caps credit at 50m", () => {
  // Exact 50:00 on a 25m planned session
  const atCap = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 50 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 5,
  });

  assert.equal(atCap.phase, "credit_limit_reached");
  assert.equal(atCap.statusHeader, "FOCUS CREDIT LIMIT REACHED");
  assert.equal(atCap.isCreditLimitReached, true);
  assert.equal(atCap.projectedCreditedMinutes, 50);
  assert.equal(atCap.ringTone, "warning");
  assert.ok(
    atCap.bannerMessage.includes(
      "Additional elapsed time will not increase the focus credit for this session",
    ),
  );

  // At 56:45 on a 25m planned session (the exact bug scenario from the audit screenshot)
  const pastCap = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + (56 * 60 + 45) * 1000,
    plannedMinutes: 25,
    minValidMinutes: 5,
  });

  assert.equal(pastCap.phase, "credit_limit_reached");
  assert.equal(pastCap.statusHeader, "FOCUS CREDIT LIMIT REACHED");
  assert.equal(pastCap.clockDisplay, "56:45");
  assert.equal(pastCap.elapsedMinutes, 56);
  assert.equal(pastCap.projectedCreditedMinutes, 50);
  assert.equal(pastCap.subLabel, "50:00 credited · 56m elapsed");
});

test("B6: Browser refresh / background sleep recovery derives exact elapsed time from server startedAt timestamp", () => {
  // Simulate tab opening at t = 2m, sleeping/refreshing, and re-mounting at t = 27m 40s
  const beforeRefresh = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 2 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 5,
  });
  assert.equal(beforeRefresh.elapsedSeconds, 120);
  assert.equal(beforeRefresh.phase, "below_min");

  const afterRefresh = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + (27 * 60 + 40) * 1000,
    plannedMinutes: 25,
    minValidMinutes: 5,
  });
  assert.equal(afterRefresh.elapsedSeconds, 27 * 60 + 40);
  assert.equal(afterRefresh.phase, "overtime");
  assert.equal(afterRefresh.projectedCreditedMinutes, 27);
});

test("B7, B8, B9, B10: Session duration summary & server verification formatting for valid, capped, and invalid sessions", () => {
  // B7: Backend returns valid uncapped session
  assert.equal(
    formatSessionDurationSummary({ actualMinutes: 25, creditedMinutes: 25, isValid: true }),
    "25 min credited",
  );

  // B7 (capped): Backend returns valid capped overtime session (56m actual -> 50m credited)
  assert.equal(
    formatSessionDurationSummary({ actualMinutes: 56, creditedMinutes: 50, isValid: true }),
    "50 min credited (56 min elapsed)",
  );

  // B8: Backend returns invalid session (below minimum duration)
  assert.equal(
    formatSessionDurationSummary({ actualMinutes: 3, creditedMinutes: 0, isValid: false }),
    "3 min elapsed · 0 min credited",
  );
});

test("B12 & B13: Focus metrics never display misleading 0% valid rate or green success tone when plan has 0 Must-dos", () => {
  // Empty draft plan (0 Must-dos) and 0 completed sessions today
  const emptyDraftPlan = makePlan({ status: "draft" });
  const unconfiguredMetrics = buildFocusPageMetrics({
    sessionsCount: 0,
    validSessionsCount: 0,
    minValidFocusMinutes: 5,
    plan: emptyDraftPlan,
  });

  // B12: No 0% when 0 completed sessions
  assert.equal(unconfiguredMetrics.validRateValue, "—");
  assert.equal(unconfiguredMetrics.validRateHint, "No completed sessions yet.");
  assert.equal(unconfiguredMetrics.validRateTone, "default");

  // B13: No green "0m" success tone when plan has 0 Must-dos
  assert.equal(unconfiguredMetrics.planFocusLeftValue, "Not configured");
  assert.equal(
    unconfiguredMetrics.planFocusLeftHint,
    "Add Must-do tasks to establish today's focus target.",
  );
  assert.equal(unconfiguredMetrics.planFocusLeftTone, "default");
  assert.equal(unconfiguredMetrics.gateConfigured, false);
  assert.equal(unconfiguredMetrics.gateTitle, "Not configured");
  assert.equal(unconfiguredMetrics.gateDescription, "Add 1–5 Must-do tasks in your Planner.");

  // Populated active plan with 50m required and 25m done -> default tone, 25m left
  const activePartialPlan = makePlan({
    status: "active",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 1,
      focusRequired: 50,
      focusDone: 25,
      bonusCompleted: 0,
    },
  });
  const partialMetrics = buildFocusPageMetrics({
    sessionsCount: 2,
    validSessionsCount: 2,
    minValidFocusMinutes: 5,
    plan: activePartialPlan,
  });
  assert.equal(partialMetrics.validRateValue, "100%");
  assert.equal(partialMetrics.validRateTone, "success");
  assert.equal(partialMetrics.planFocusLeftValue, "25m");
  assert.equal(partialMetrics.planFocusLeftTone, "default");
  assert.equal(partialMetrics.gateConfigured, true);

  // Populated active plan with all focus completed (50m / 50m) -> success tone
  const activeDonePlan = makePlan({
    status: "active",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 1,
      focusRequired: 50,
      focusDone: 50,
      bonusCompleted: 0,
    },
  });
  const doneMetrics = buildFocusPageMetrics({
    sessionsCount: 2,
    validSessionsCount: 2,
    minValidFocusMinutes: 5,
    plan: activeDonePlan,
  });
  assert.equal(doneMetrics.planFocusLeftValue, "0m");
  assert.equal(doneMetrics.planFocusLeftTone, "success");
});

test("B14: Focus mode labels format all enum values and unknown fallbacks cleanly", () => {
  assert.equal(formatFocusModeLabel("pomodoro_25_5"), "Pomodoro 25/5");
  assert.equal(formatFocusModeLabel("pomodoro_50_10"), "Deep Work 50/10");
  assert.equal(formatFocusModeLabel("deep_50_10"), "Deep Work 50/10");
  assert.equal(formatFocusModeLabel("custom"), "Custom");
  assert.equal(formatFocusModeLabel("open_ended"), "Open-ended");
  assert.equal(formatFocusModeLabel("flow_90_15"), "Flow 90 15");
});
