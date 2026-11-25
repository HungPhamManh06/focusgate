import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BUILT_IN_PLAN_TEMPLATES,
  buildMicroStepsForStalledTask,
  computeCapacityAnalysis,
  computeSleepCorrelation,
  generateWeeklyCoachInsights,
} from "../lib/domain/focus-coach.ts";

describe("focus-coach v4 domain helpers", () => {
  it("flags over-capacity when planned minutes exceed remaining daylight", () => {
    const cap = computeCapacityAnalysis(240, 20, 0, 22);
    assert.equal(cap.remainingMinutesToday, 120);
    assert.equal(cap.overCapacityMinutes, 120);
    assert.equal(cap.isOverCapacity, true);

    const ok = computeCapacityAnalysis(60, 14, 0, 22);
    assert.equal(ok.isOverCapacity, false);
    assert.equal(ok.overCapacityMinutes, 0);
  });

  it("computes sleep vs focus drop percentage accurately", () => {
    const days = [
      { date: "2026-11-20", label: "Fri", focusMinutes: 120, tasksCompleted: 4, entertainmentMinutes: 15 },
      { date: "2026-11-21", label: "Sat", focusMinutes: 60, tasksCompleted: 2, entertainmentMinutes: 30 },
    ];
    const health = [
      { date: "2026-11-20", sleepMinutes: 450 },
      { date: "2026-11-21", sleepMinutes: 330 },
    ];
    const corr = computeSleepCorrelation(days, health);
    assert.equal(corr.goodSleepAvgFocus, 120);
    assert.equal(corr.lowSleepAvgFocus, 60);
    assert.equal(corr.focusDropPercent, 50);
  });

  it("generates weekly coach insights & 3 micro-steps for stalled tasks", () => {
    const insights = generateWeeklyCoachInsights({
      days: [],
      healthDays: [],
      hourlyFocus: [{ hour: 9, focusMinutes: 90, blockedAttempts: 0 }],
      blockedAttempts: 7,
      completionRate: 82,
    });
    assert.equal(insights.length, 3);
    assert.equal(insights[0]?.id, "golden-hour");

    const steps = buildMicroStepsForStalledTask("Ôn thi Hệ điều hành chương 4");
    assert.equal(steps.length, 3);
    assert.equal(steps[0]?.estimatedMinutes, 10);
    assert.equal(BUILT_IN_PLAN_TEMPLATES.length, 3);
  });
});
