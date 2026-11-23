import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFocusPageMetrics,
  computeFocusTimerState,
  evaluateFocusStarterOptions,
  executeFocusCancelFlow,
  executeFocusCompleteFlow,
  formatFocusModeLabel,
  formatSessionDurationSummary,
  getFocusSubmissionUiLabels,
  type FocusSubmissionState,
} from "../lib/domain/focus-timer-state.ts";
import {
  getMinAllowedPlannedMinutes,
  validatePlannedDurationAgainstMinValid,
} from "../lib/validation.ts";
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
  assert.equal(
    formatSessionDurationSummary({ actualMinutes: 25, creditedMinutes: 25, isValid: true }),
    "25 min credited",
  );
  assert.equal(
    formatSessionDurationSummary({ actualMinutes: 56, creditedMinutes: 50, isValid: true }),
    "50 min credited (56 min elapsed)",
  );
  assert.equal(
    formatSessionDurationSummary({ actualMinutes: 3, creditedMinutes: 0, isValid: false }),
    "3 min elapsed · 0 min credited",
  );
});

test("B12 & B13: Focus metrics never display misleading 0% valid rate or green success tone when plan has 0 Must-dos", () => {
  const emptyDraftPlan = makePlan({ status: "draft" });
  const unconfiguredMetrics = buildFocusPageMetrics({
    sessionsCount: 0,
    validSessionsCount: 0,
    minValidFocusMinutes: 5,
    plan: emptyDraftPlan,
  });

  assert.equal(unconfiguredMetrics.validRateValue, "—");
  assert.equal(unconfiguredMetrics.validRateHint, "No completed sessions yet.");
  assert.equal(unconfiguredMetrics.validRateTone, "default");

  assert.equal(unconfiguredMetrics.planFocusLeftValue, "Not configured");
  assert.equal(
    unconfiguredMetrics.planFocusLeftHint,
    "Add Must-do tasks to establish today's focus target.",
  );
  assert.equal(unconfiguredMetrics.planFocusLeftTone, "default");
  assert.equal(unconfiguredMetrics.gateConfigured, false);
  assert.equal(unconfiguredMetrics.gateTitle, "Not configured");
  assert.equal(unconfiguredMetrics.gateDescription, "Add 1–5 Must-do tasks in your Planner.");

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
  assert.equal(formatFocusModeLabel("open_ended"), "Stopwatch");
  assert.equal(formatFocusModeLabel("flow_90_15"), "Flow 90 15");
});

// ===========================================================================
// Milestone A1.1 Regression Suite: P1.1 (Complete vs. Cancel Retry Intent)
// ===========================================================================

test("A1.1-A: Complete vs Cancel failure and retry flows preserve user intent and never cross-call", async () => {
  let submission: FocusSubmissionState = { status: "idle" };
  let confirmEndOpen = true;
  let confirmCancelOpen = true;
  const inFlightRef = { current: false };

  let completeCalls = 0;
  let cancelCalls = 0;

  // 1. Complete fails due to network error -> state is complete_error, retry target is complete, label is "Retry end & log session"
  const completeFailState = await executeFocusCompleteFlow({
    sessionId: "sess-1",
    inFlightRef,
    setSubmission: (s) => {
      submission = s;
    },
    setConfirmEndOpen: (open) => {
      confirmEndOpen = open;
    },
    completeAction: async () => {
      completeCalls += 1;
      throw new Error("Network timeout on complete");
    },
  });

  assert.equal(completeCalls, 1);
  assert.equal(cancelCalls, 0);
  assert.equal(completeFailState.status, "complete_error");
  assert.equal(submission.status, "complete_error");
  assert.equal(confirmEndOpen, true); // dialog stays open on failure
  const completeErrUi = getFocusSubmissionUiLabels(completeFailState);
  assert.equal(completeErrUi.retryTarget, "complete");
  assert.equal(completeErrUi.primaryCompleteLabel, "Retry end & log session");

  // Retry Complete -> calls completeAction (never cancelAction), succeeds, closes dialog, sets verified state
  const completeSuccessState = await executeFocusCompleteFlow({
    sessionId: "sess-1",
    inFlightRef,
    setSubmission: (s) => {
      submission = s;
    },
    setConfirmEndOpen: (open) => {
      confirmEndOpen = open;
    },
    completeAction: async (id) => {
      completeCalls += 1;
      return {
        success: "Session verified — 25 focused minutes credited.",
        verification: {
          sessionId: id,
          actualMinutes: 25,
          creditedMinutes: 25,
          plannedMinutes: 25,
          minValidMinutes: 5,
          isValid: true,
          idempotent: false,
        },
      };
    },
  });

  assert.equal(completeCalls, 2);
  assert.equal(cancelCalls, 0); // Complete retry NEVER called Cancel
  assert.equal(confirmEndOpen, false); // Closed after success
  assert.equal(completeSuccessState.status, "verified");
  if (completeSuccessState.status === "verified") {
    assert.equal(completeSuccessState.verification.creditedMinutes, 25);
  }

  // 2. Cancel fails due to network error -> state is cancel_error, retry target is cancel,
  // Cancel dialog stays open, label is "Retry cancel session", and Cancel retry NEVER calls Complete!
  submission = { status: "idle" };
  confirmCancelOpen = true;

  const cancelFailRes = await executeFocusCancelFlow({
    sessionId: "sess-2",
    inFlightRef,
    setSubmission: (s) => {
      submission = s;
    },
    setConfirmCancelOpen: (open) => {
      confirmCancelOpen = open;
    },
    cancelAction: async () => {
      cancelCalls += 1;
      return { error: "Temporary network failure while cancelling" };
    },
  });

  assert.equal(cancelFailRes.cancelled, false);
  assert.equal(cancelCalls, 1);
  assert.equal(completeCalls, 2); // Cancel failure NEVER called Complete
  assert.equal(cancelFailRes.state.status, "cancel_error");
  assert.equal(confirmCancelOpen, true); // Cancel dialog stays open so user can retry Cancel

  const cancelErrUi = getFocusSubmissionUiLabels(cancelFailRes.state);
  assert.equal(cancelErrUi.retryTarget, "cancel");
  assert.equal(cancelErrUi.cancelDialogConfirmLabel, "Retry cancel session");

  // Retry Cancel -> calls cancelAction (never completeAction), closes dialog, resets state to idle (never verified!)
  const cancelSuccessRes = await executeFocusCancelFlow({
    sessionId: "sess-2",
    inFlightRef,
    setSubmission: (s) => {
      submission = s;
    },
    setConfirmCancelOpen: (open) => {
      confirmCancelOpen = open;
    },
    cancelAction: async () => {
      cancelCalls += 1;
      return { success: "Session cancelled. Nothing was counted." };
    },
  });

  assert.equal(cancelSuccessRes.cancelled, true);
  assert.equal(cancelCalls, 2);
  assert.equal(completeCalls, 2); // Cancel retry NEVER called Complete
  assert.equal(confirmCancelOpen, false); // Dialog closed only after success
  assert.equal(cancelSuccessRes.state.status, "idle"); // Never displays misleading verified completion state
});

test("A1.1-A: Synchronous inFlightRef prevents duplicate concurrent Complete or Cancel submissions", async () => {
  const inFlightRef = { current: false };
  let submission: FocusSubmissionState = { status: "idle" };
  let calls = 0;

  let resolveAction!: (val: { success: string }) => void;
  const slowAction = () =>
    new Promise<{ success: string }>((resolve) => {
      calls += 1;
      resolveAction = resolve;
    });

  // Fire two concurrent cancel clicks
  const p1 = executeFocusCancelFlow({
    sessionId: "sess-race",
    inFlightRef,
    setSubmission: (s) => {
      submission = s;
    },
    setConfirmCancelOpen: () => undefined,
    cancelAction: slowAction,
  });

  // While p1 is in flight, check UI labels and fire second click
  assert.equal(inFlightRef.current, true);
  const inFlightLabels = getFocusSubmissionUiLabels(submission);
  assert.equal(inFlightLabels.isBusy, true);
  assert.equal(inFlightLabels.isCancelling, true);
  assert.equal(inFlightLabels.cancelDialogConfirmLabel, "Cancelling session…");

  const p2 = executeFocusCancelFlow({
    sessionId: "sess-race",
    inFlightRef,
    setSubmission: (s) => {
      submission = s;
    },
    setConfirmCancelOpen: () => undefined,
    cancelAction: slowAction,
  });

  resolveAction({ success: "Cancelled" });
  await Promise.all([p1, p2]);

  assert.equal(calls, 1); // Only 1 request was sent
  assert.equal(inFlightRef.current, false);
});

// ===========================================================================
// Milestone A1.1 Regression Suite: P1.2 (Minimum Duration vs Credit Cap)
// ===========================================================================

test("A1.1-B (Cases 1–5): Planned duration vs minimum-valid threshold validation and preset disabling", () => {
  // Case 1: plannedMinutes = 25, minValidMinutes = 5 -> accepted
  assert.equal(
    validatePlannedDurationAgainstMinValid({ plannedMinutes: 25, minValidFocusMinutes: 5 }).valid,
    true,
  );
  const eval5 = evaluateFocusStarterOptions(5);
  assert.equal(eval5.minAllowedCustomMinutes, 5);
  assert.equal(eval5.presets[0]?.disabled, false); // 25m allowed
  assert.equal(eval5.presets[1]?.disabled, false); // 50m allowed
  assert.equal(eval5.anyPresetAvailable, true);

  // Case 2: plannedMinutes = 25, minValidMinutes = 50 -> accepted (25 * 2 == 50)
  assert.equal(
    validatePlannedDurationAgainstMinValid({ plannedMinutes: 25, minValidFocusMinutes: 50 }).valid,
    true,
  );
  const eval50 = evaluateFocusStarterOptions(50);
  assert.equal(eval50.minAllowedCustomMinutes, 25);
  assert.equal(eval50.presets[0]?.disabled, false); // 25m allowed (max credit 50m)
  assert.equal(eval50.presets[1]?.disabled, false); // 50m allowed (max credit 100m)

  // Case 3: plannedMinutes = 25, minValidMinutes = 51 -> rejected (25 * 2 = 50 < 51)
  const check25_51 = validatePlannedDurationAgainstMinValid({
    plannedMinutes: 25,
    minValidFocusMinutes: 51,
  });
  assert.equal(check25_51.valid, false);
  if (!check25_51.valid) {
    assert.equal(check25_51.minPlannedMinutes, 26);
  }
  const eval51 = evaluateFocusStarterOptions(51);
  assert.equal(eval51.minAllowedCustomMinutes, 26);
  assert.equal(eval51.presets[0]?.disabled, true); // 25m preset disabled!
  assert.ok(eval51.presets[0]?.disabledReason?.includes("50m"));
  assert.equal(eval51.presets[1]?.disabled, false); // 50m preset still valid

  // Case 4: plannedMinutes = 30, minValidMinutes = 60 -> accepted (30 * 2 == 60)
  assert.equal(
    validatePlannedDurationAgainstMinValid({ plannedMinutes: 30, minValidFocusMinutes: 60 }).valid,
    true,
  );
  assert.equal(getMinAllowedPlannedMinutes(60), 30);

  // Case 5: plannedMinutes = 50, minValidMinutes = 120 -> rejected (50 * 2 = 100 < 120)
  const check50_120 = validatePlannedDurationAgainstMinValid({
    plannedMinutes: 50,
    minValidFocusMinutes: 120,
  });
  assert.equal(check50_120.valid, false);
  if (!check50_120.valid) {
    assert.equal(check50_120.minPlannedMinutes, 60);
  }
  const eval120 = evaluateFocusStarterOptions(120);
  assert.equal(eval120.minAllowedCustomMinutes, 60);
  assert.equal(eval120.presets[0]?.disabled, true); // 25m disabled
  assert.equal(eval120.presets[1]?.disabled, true); // 50m disabled
  assert.equal(eval120.anyPresetAvailable, false); // Guides user to Custom >= 60m
});

test("A1.1-B (Cases 8, 9, 10): Timer projected credit never contradicts minimum threshold, even when minValid > planned or on legacy impossible sessions", () => {
  // Case 9: Valid boundary configuration where plannedMinutes = 25 and snapshotted minValidMinutes = 50 (2x planned).
  // At 30 minutes elapsed (past 25m planned, but still below 50m minValid!), timer MUST NOT claim Target Reached
  // or show 30m projected credit — it must remain in below_min with 0m projected credit until 50:00!
  const boundaryAt30m = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 30 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 50,
  });
  assert.equal(boundaryAt30m.phase, "below_min");
  assert.equal(boundaryAt30m.meetsMinimumThreshold, false);
  assert.equal(boundaryAt30m.projectedCreditedMinutes, 0);
  assert.ok(boundaryAt30m.bannerTitle.includes("Minimum 50m required"));

  // Once it reaches 50:00, it satisfies the 50m minimum and hits the 50m credit cap with 50m credit
  const boundaryAt50m = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 50 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 50,
  });
  assert.equal(boundaryAt50m.phase, "credit_limit_reached");
  assert.equal(boundaryAt50m.meetsMinimumThreshold, true);
  assert.equal(boundaryAt50m.projectedCreditedMinutes, 50);

  // Case 10: Legacy impossible session where plannedMinutes = 25 (max credit 50m) and minValidMinutes = 60.
  // Even at 55 minutes (past the 50m credit cap) or 65 minutes (past 60m), projectedCreditedMinutes is ALWAYS 0
  // and the UI explicitly warns that the minimum threshold exceeds the session's credit cap.
  const legacyAt55m = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 55 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 60,
  });
  assert.equal(legacyAt55m.isImpossibleConfiguration, true);
  assert.equal(legacyAt55m.meetsMinimumThreshold, false);
  assert.equal(legacyAt55m.projectedCreditedMinutes, 0);
  assert.ok(legacyAt55m.bannerTitle.includes("exceeds this session's 50m credit cap"));

  const legacyAt65m = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 65 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 60,
  });
  assert.equal(legacyAt65m.isImpossibleConfiguration, true);
  assert.equal(legacyAt65m.meetsMinimumThreshold, false);
  assert.equal(legacyAt65m.projectedCreditedMinutes, 0);
});

test("UX-008: Paused sessions freeze clock at pausedAt and exclude pausedSeconds when resumed", () => {
  const pausedAt = new Date(STARTED_MS + 12 * 60 * 1000).toISOString();
  const pausedState = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 30 * 60 * 1000, // 18m later while still paused
    plannedMinutes: 25,
    minValidMinutes: 5,
    status: "paused",
    pausedAtIso: pausedAt,
    pausedSeconds: 120, // 2m prior pause
  });

  assert.equal(pausedState.phase, "paused");
  assert.equal(pausedState.isPaused, true);
  assert.equal(pausedState.elapsedMinutes, 10); // 12m - 2m prior pause
  assert.equal(pausedState.clockDisplay, "10:00");

  // Resumed after 10m total paused time (600s), at wall clock 25m -> 15m active focus
  const resumedState = computeFocusTimerState({
    startedAtIso: STARTED_AT,
    nowMs: STARTED_MS + 25 * 60 * 1000,
    plannedMinutes: 25,
    minValidMinutes: 5,
    status: "running",
    pausedAtIso: null,
    pausedSeconds: 600,
  });

  assert.equal(resumedState.isPaused, false);
  assert.equal(resumedState.phase, "focusing");
  assert.equal(resumedState.elapsedMinutes, 15);
  assert.equal(resumedState.clockDisplay, "15:00");
});
