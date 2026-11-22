import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMissionViewModel,
  formatPlanProgressStat,
  resolveMissionPhase,
  selectNextMoveFromTasks,
  summarizeWalletForDashboard,
} from "../lib/domain/dashboard-state.ts";
import type { Grant, Plan, RewardSettings, Task, Wallet } from "../lib/data/types.ts";

const SETTINGS: RewardSettings = {
  baseMinutes: 30,
  bonusMinutesPerTask: 5,
  extraFocusBlockMinutes: 50,
  extraFocusRewardMinutes: 5,
  maxBonusMinutes: 30,
  dailyCapMinutes: 60,
  minValidFocusMinutes: 20,
};

function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: "plan-1",
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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    title: "Write the weekly product brief",
    description: null,
    category: "work",
    kind: "must_do",
    priority: "high",
    estimatedMinutes: 45,
    requiredFocusMinutes: 25,
    dueDate: "2026-11-22T17:00:00Z",
    status: "todo",
    completedAt: null,
    createdAt: "2026-11-22T01:00:00Z",
    ...overrides,
  };
}

test("Mission state mapping and empty progress handling across all plan states", () => {
  // 1. No plan
  const noPlanVm = buildMissionViewModel(null, SETTINGS);
  assert.equal(noPlanVm.phase, "no_plan");
  assert.equal(noPlanVm.currentStepNumber, "01");
  assert.equal(noPlanVm.currentStepLabel, "Plan");
  assert.equal(noPlanVm.mustDoPercent, null);
  assert.equal(noPlanVm.focusPercent, null);
  assert.equal(noPlanVm.stages[0]?.state, "current");
  assert.equal(noPlanVm.stages[1]?.state, "locked");

  // 2. Draft without Must-do (0/0 protection)
  const draftEmptyPlan = makePlan({ status: "draft" });
  const draftEmptyVm = buildMissionViewModel(draftEmptyPlan, SETTINGS);
  assert.equal(draftEmptyVm.phase, "draft_empty");
  assert.equal(draftEmptyVm.currentStepNumber, "01");
  assert.equal(draftEmptyVm.hasMustDos, false);
  assert.equal(draftEmptyVm.hasFocusTarget, false);
  assert.equal(draftEmptyVm.mustDoPercent, null);
  assert.equal(draftEmptyVm.focusPercent, null);
  assert.equal(draftEmptyVm.statusLine, "0 Must-do tasks selected");

  const emptyStat = formatPlanProgressStat(draftEmptyPlan);
  assert.equal(emptyStat.value, "No tasks selected");
  assert.equal(emptyStat.hint, "Awaiting your first Must-do task");

  // 3. Draft with Must-do ready to confirm
  const draftReadyPlan = makePlan({
    status: "draft",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 0,
      focusRequired: 50,
      focusDone: 0,
      bonusCompleted: 0,
    },
  });
  const draftReadyVm = buildMissionViewModel(draftReadyPlan, SETTINGS);
  assert.equal(draftReadyVm.phase, "draft_ready");
  assert.equal(draftReadyVm.currentStepNumber, "02");
  assert.equal(draftReadyVm.currentStepLabel, "Commit");
  assert.equal(draftReadyVm.mustDoPercent, 0);
  assert.equal(draftReadyVm.focusPercent, 0);
  assert.equal(draftReadyVm.stages[0]?.state, "completed");
  assert.equal(draftReadyVm.stages[1]?.state, "current");

  // 4. Confirmed plan
  const confirmedPlan = makePlan({
    status: "confirmed",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 0,
      focusRequired: 50,
      focusDone: 0,
      bonusCompleted: 0,
    },
  });
  const confirmedVm = buildMissionViewModel(confirmedPlan, SETTINGS);
  assert.equal(confirmedVm.phase, "confirmed");
  assert.equal(confirmedVm.currentStepNumber, "02");
  assert.equal(confirmedVm.stages[0]?.state, "completed");
  assert.equal(confirmedVm.stages[1]?.state, "current");

  // 5. Active plan with focus remaining
  const activePlan = makePlan({
    status: "active",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 1,
      focusRequired: 60,
      focusDone: 35,
      bonusCompleted: 0,
    },
  });
  const activeVm = buildMissionViewModel(activePlan, SETTINGS);
  assert.equal(activeVm.phase, "active_focus");
  assert.equal(activeVm.currentStepNumber, "03");
  assert.equal(activeVm.currentStepLabel, "Focus");
  assert.equal(activeVm.mustDoPercent, 50);
  assert.equal(activeVm.focusPercent, 58);

  // 6. Active plan ready to close
  const readyPlan = makePlan({
    status: "active",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 2,
      focusRequired: 50,
      focusDone: 50,
      bonusCompleted: 1,
    },
  });
  const readyVm = buildMissionViewModel(readyPlan, SETTINGS);
  assert.equal(readyVm.phase, "active_ready_to_close");
  assert.equal(readyVm.currentStepNumber, "04");
  assert.equal(readyVm.currentStepLabel, "Complete");
  assert.equal(readyVm.readyToCloseDay, true);
  assert.equal(readyVm.estimatedReward, 35);

  // 7. Completed plan (unclaimed vs claimed)
  const completedPlan = makePlan({
    status: "completed",
    progress: {
      mustDoTotal: 2,
      mustDoCompleted: 2,
      focusRequired: 50,
      focusDone: 50,
      bonusCompleted: 1,
    },
  });
  const unclaimedVm = buildMissionViewModel(completedPlan, SETTINGS);
  assert.equal(unclaimedVm.phase, "completed_unclaimed");
  assert.equal(unclaimedVm.currentStepNumber, "05");
  assert.equal(unclaimedVm.stages[4]?.state, "current");

  const grant: Grant = {
    id: "grant-1",
    dailyPlanId: "plan-1",
    grantedMinutes: 35,
    consumedMinutes: 10,
    remainingMinutes: 25,
    status: "active",
    source: "daily_plan_base",
    expiresAt: "2026-11-23T04:00:00Z",
    createdAt: "2026-11-22T10:00:00Z",
  };
  const claimedVm = buildMissionViewModel(completedPlan, SETTINGS, grant);
  assert.equal(resolveMissionPhase(completedPlan, grant), "completed_claimed");
  assert.equal(claimedVm.phase, "completed_claimed");
  assert.equal(claimedVm.stages[4]?.state, "completed");
});

test("Your Next Move selection prioritizes plan Must-dos, deadlines, and suppresses Bonus and completed tasks", () => {
  const completedMustDo = makeTask({
    id: "t-done",
    title: "Completed Must-do",
    kind: "must_do",
    status: "completed",
    completedAt: "2026-11-22T09:00:00Z",
  });
  const bonusEarlyDue = makeTask({
    id: "t-bonus",
    title: "Bonus with early deadline",
    kind: "bonus",
    priority: "urgent",
    dueDate: "2026-11-22T10:00:00Z",
  });
  const backlogMustDoLater = makeTask({
    id: "t-must-later",
    title: "Backlog Must-do due tomorrow",
    kind: "must_do",
    dueDate: "2026-11-23T17:00:00Z",
  });
  const backlogMustDoSooner = makeTask({
    id: "t-must-sooner",
    title: "Backlog Must-do due today",
    kind: "must_do",
    dueDate: "2026-11-22T15:00:00Z",
  });

  // Never selects completed tasks or Bonus tasks when Must-dos are open
  const pickedFromBacklog = selectNextMoveFromTasks(
    [completedMustDo, bonusEarlyDue, backlogMustDoLater, backlogMustDoSooner],
    null,
  );
  assert.ok(pickedFromBacklog);
  assert.equal(pickedFromBacklog.task.id, "t-must-sooner");
  assert.equal(pickedFromBacklog.inTodayPlan, false);

  // When a Must-do is in today's plan, it wins over an earlier backlog Must-do
  const planWithMustDo = makePlan({
    status: "active",
    tasks: [
      {
        id: "pt-1",
        taskId: "t-must-later",
        kind: "must_do",
        requiredFocusMinutes: 25,
        completedAt: null,
        title: backlogMustDoLater.title,
        description: null,
        status: "todo",
        priority: "high",
        focusDone: 10,
      },
    ],
  });
  const pickedFromPlan = selectNextMoveFromTasks(
    [bonusEarlyDue, backlogMustDoLater, backlogMustDoSooner],
    planWithMustDo,
  );
  assert.ok(pickedFromPlan);
  assert.equal(pickedFromPlan.task.id, "t-must-later");
  assert.equal(pickedFromPlan.inTodayPlan, true);

  // When only completed tasks exist, returns null
  assert.equal(selectNextMoveFromTasks([completedMustDo], null), null);
});

test("Reward wallet summary computes authoritative active and expired balances without earned - spent inference", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  const wallet: Wallet = {
    availableMinutes: 20,
    earnedMinutes: 65,
    consumedMinutes: 25,
    grants: [
      {
        id: "g-active",
        dailyPlanId: "p-today",
        grantedMinutes: 35,
        consumedMinutes: 15,
        remainingMinutes: 20,
        status: "active",
        source: "daily_plan_base",
        expiresAt: "2026-11-23T04:00:00Z",
        createdAt: "2026-11-22T08:00:00Z",
      },
      {
        id: "g-expired",
        dailyPlanId: "p-yesterday",
        grantedMinutes: 30,
        consumedMinutes: 10,
        remainingMinutes: 20,
        status: "expired",
        source: "daily_plan_base",
        expiresAt: "2026-11-22T04:00:00Z",
        createdAt: "2026-11-21T08:00:00Z",
      },
    ],
    ledger: [],
    usage: [],
  };

  const summary = summarizeWalletForDashboard(wallet, now);
  assert.equal(summary.availableMinutes, 20);
  assert.equal(summary.earnedMinutes, 65);
  assert.equal(summary.consumedMinutes, 25);
  assert.equal(summary.expiredMinutes, 20);
  assert.equal(summary.activeGrants.length, 1);
  assert.equal(summary.expiredGrants.length, 1);
  assert.equal(summary.nextExpiringGrant?.id, "g-active");
});
