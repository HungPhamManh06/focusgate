import { formatMinutes } from "../data/format.ts";
import type { Grant, Plan, RewardSettings, Task, Wallet } from "../data/types.ts";

export type StageKey = "plan" | "commit" | "focus" | "complete" | "unlock";
export type StageState = "completed" | "current" | "locked";

export interface JourneyStageInfo {
  stepNumber: string;
  key: StageKey;
  label: string;
  state: StageState;
}

export type MissionPhase =
  | "no_plan"
  | "draft_empty"
  | "draft_ready"
  | "confirmed"
  | "active_focus"
  | "active_ready_to_close"
  | "completed_unclaimed"
  | "completed_claimed";

export interface MissionViewModel {
  phase: MissionPhase;
  currentStepNumber: string;
  currentStepLabel: string;
  headline: string;
  description: string;
  statusLine: string;
  stages: JourneyStageInfo[];
  hasMustDos: boolean;
  hasFocusTarget: boolean;
  mustDoPercent: number | null;
  focusPercent: number | null;
  estimatedReward: number;
  readyToCloseDay: boolean;
}

export function resolveMissionPhase(
  plan: Plan | null,
  todayGrant: Grant | undefined,
): MissionPhase {
  if (!plan) return "no_plan";
  if (plan.status === "draft") {
    return plan.progress.mustDoTotal === 0 ? "draft_empty" : "draft_ready";
  }
  if (plan.status === "confirmed") return "confirmed";
  if (plan.status === "active") {
    const allMustDosDone =
      plan.progress.mustDoTotal > 0 &&
      plan.progress.mustDoCompleted >= plan.progress.mustDoTotal;
    const focusMet = plan.progress.focusDone >= plan.progress.focusRequired;
    return allMustDosDone && focusMet ? "active_ready_to_close" : "active_focus";
  }
  if (plan.status === "completed") {
    return todayGrant ? "completed_claimed" : "completed_unclaimed";
  }
  return "no_plan";
}

export function buildMissionViewModel(
  plan: Plan | null,
  settings: RewardSettings,
  todayGrant?: Grant,
): MissionViewModel {
  const phase = resolveMissionPhase(plan, todayGrant);
  const mustDoTotal = plan?.progress.mustDoTotal ?? 0;
  const mustDoCompleted = plan?.progress.mustDoCompleted ?? 0;
  const focusRequired = plan?.progress.focusRequired ?? 0;
  const focusDone = plan?.progress.focusDone ?? 0;
  const bonusCompleted = plan?.progress.bonusCompleted ?? 0;

  const hasMustDos = mustDoTotal > 0;
  const hasFocusTarget = focusRequired > 0;

  // Never divide by zero or return a misleading 0% when not configured.
  const mustDoPercent = hasMustDos
    ? Math.min(100, Math.round((mustDoCompleted / mustDoTotal) * 100))
    : null;
  const focusPercent = hasFocusTarget
    ? Math.min(100, Math.round((focusDone / focusRequired) * 100))
    : null;

  const estimatedReward = plan
    ? Math.min(
        settings.dailyCapMinutes,
        settings.baseMinutes +
          Math.min(
            bonusCompleted * settings.bonusMinutesPerTask,
            settings.maxBonusMinutes,
          ),
      )
    : settings.baseMinutes;

  const readyToCloseDay = phase === "active_ready_to_close";

  const stageStates: Record<StageKey, StageState> = {
    plan: "locked",
    commit: "locked",
    focus: "locked",
    complete: "locked",
    unlock: "locked",
  };

  let currentStepNumber = "01";
  let currentStepLabel = "Plan";
  let headline = "Make today count.";
  let description = "Start by choosing a few things that really matter today.";
  let statusLine = "No plan created for today yet";

  switch (phase) {
    case "no_plan": {
      stageStates.plan = "current";
      currentStepNumber = "01";
      currentStepLabel = "Plan";
      headline = "Make today count.";
      description =
        "Start by choosing a few things that really matter today. Must-do tasks form your daily gate.";
      statusLine = `Base reward: ${formatMinutes(settings.baseMinutes)} upon completion`;
      break;
    }
    case "draft_empty": {
      stageStates.plan = "current";
      currentStepNumber = "01";
      currentStepLabel = "Plan";
      headline = "No Must-do tasks yet.";
      description =
        "Choose at least one important task to establish today's commitment.";
      statusLine =
        plan && plan.tasks.length > 0
          ? `0 Must-do tasks selected (${plan.tasks.length} optional task${plan.tasks.length === 1 ? "" : "s"} in draft)`
          : "0 Must-do tasks selected";
      break;
    }
    case "draft_ready": {
      stageStates.plan = "completed";
      stageStates.commit = "current";
      currentStepNumber = "02";
      currentStepLabel = "Commit";
      headline = "Confirm today's contract.";
      description =
        "Your Must-do commitments are selected. Confirm the plan to lock the gate for today.";
      statusLine = `${mustDoTotal} Must-do task${mustDoTotal === 1 ? "" : "s"} selected · ${
        hasFocusTarget
          ? `${formatMinutes(focusRequired)} focus target`
          : "Focus target not set"
      }`;
      break;
    }
    case "confirmed": {
      stageStates.plan = "completed";
      stageStates.commit = "current";
      currentStepNumber = "02";
      currentStepLabel = "Commit";
      headline = "The gate is locked. Activate focus.";
      description =
        "Your daily contract is confirmed. Activate focus mode to begin logging verified sessions toward your reward.";
      statusLine = `${mustDoTotal} Must-do task${mustDoTotal === 1 ? "" : "s"} locked · ${
        hasFocusTarget
          ? `${formatMinutes(focusRequired)} required focus`
          : "Ready to complete in active mode"
      }`;
      break;
    }
    case "active_focus": {
      stageStates.plan = "completed";
      stageStates.commit = "completed";
      const focusTargetAlreadyMet = !hasFocusTarget || focusDone >= focusRequired;
      if (focusTargetAlreadyMet) {
        stageStates.focus = "completed";
        stageStates.complete = "current";
        currentStepNumber = "04";
        currentStepLabel = "Complete";
        headline = "Finish your remaining Must-dos.";
        description =
          "Your focus requirement is met. Mark every remaining Must-do task complete in the planner to close the day.";
        statusLine = `${mustDoCompleted} of ${mustDoTotal} Must-do tasks completed`;
      } else {
        stageStates.focus = "current";
        currentStepNumber = "03";
        currentStepLabel = "Focus";
        headline = "Protect your attention.";
        description =
          "Complete verified focus sessions to meet today's focus requirement and unlock task completion.";
        statusLine = `${formatMinutes(focusDone)} / ${formatMinutes(focusRequired)} minutes completed`;
      }
      break;
    }
    case "active_ready_to_close": {
      stageStates.plan = "completed";
      stageStates.commit = "completed";
      stageStates.focus = "completed";
      stageStates.complete = "current";
      currentStepNumber = "04";
      currentStepLabel = "Complete";
      headline = "All commitments met. Close the day.";
      description =
        "Every Must-do task and verified focus target is complete. Close the day now to unlock your reward.";
      statusLine = `${mustDoCompleted}/${mustDoTotal} Must-dos done · ${formatMinutes(focusDone)} verified focus`;
      break;
    }
    case "completed_unclaimed": {
      stageStates.plan = "completed";
      stageStates.commit = "completed";
      stageStates.focus = "completed";
      stageStates.complete = "completed";
      stageStates.unlock = "current";
      currentStepNumber = "05";
      currentStepLabel = "Unlock";
      headline = "Your work has earned you time.";
      description =
        "Your daily gate is complete. Claim your reward to add leisure time to your wallet.";
      statusLine = `Est. ${formatMinutes(estimatedReward)} earned · ready to claim`;
      break;
    }
    case "completed_claimed": {
      stageStates.plan = "completed";
      stageStates.commit = "completed";
      stageStates.focus = "completed";
      stageStates.complete = "completed";
      stageStates.unlock = "completed";
      currentStepNumber = "05";
      currentStepLabel = "Unlock";
      headline = "Today's gate is complete and rewarded.";
      description =
        "Your earned leisure time has been added to your Reward Wallet. Enjoy it deliberately.";
      statusLine = todayGrant
        ? `Claimed ${formatMinutes(todayGrant.grantedMinutes)} · ${formatMinutes(todayGrant.remainingMinutes)} remaining`
        : "Reward claimed";
      break;
    }
  }

  const stages: JourneyStageInfo[] = [
    {
      stepNumber: "01",
      key: "plan",
      label: "Plan",
      state: stageStates.plan,
    },
    {
      stepNumber: "02",
      key: "commit",
      label: "Commit",
      state: stageStates.commit,
    },
    {
      stepNumber: "03",
      key: "focus",
      label: "Focus",
      state: stageStates.focus,
    },
    {
      stepNumber: "04",
      key: "complete",
      label: "Complete",
      state: stageStates.complete,
    },
    {
      stepNumber: "05",
      key: "unlock",
      label: "Unlock",
      state: stageStates.unlock,
    },
  ];

  return {
    phase,
    currentStepNumber,
    currentStepLabel,
    headline,
    description,
    statusLine,
    stages,
    hasMustDos,
    hasFocusTarget,
    mustDoPercent,
    focusPercent,
    estimatedReward,
    readyToCloseDay,
  };
}

export interface PlanProgressCardDisplay {
  value: string;
  hint: string;
  tone: "default" | "accent" | "success" | "warning";
}

export function formatPlanProgressStat(plan: Plan | null): PlanProgressCardDisplay {
  if (!plan) {
    return {
      value: "No plan",
      hint: "Create today's plan to set your Must-do gate",
      tone: "default",
    };
  }
  const { mustDoTotal, mustDoCompleted } = plan.progress;
  if (mustDoTotal === 0) {
    return {
      value: "No tasks selected",
      hint:
        plan.tasks.length > 0
          ? `${plan.tasks.length} optional task${plan.tasks.length === 1 ? "" : "s"} in draft · add a Must-do`
          : "Awaiting your first Must-do task",
      tone: "warning",
    };
  }
  const percent = Math.round((mustDoCompleted / mustDoTotal) * 100);
  return {
    value: `${mustDoCompleted}/${mustDoTotal}`,
    hint: `${percent}% of today's Must-do gate completed`,
    tone: percent === 100 ? "success" : "default",
  };
}

export interface NextMoveCandidateResult {
  task: Task;
  inTodayPlan: boolean;
  planTaskId: string | null;
  focusDone: number;
  focusRequired: number;
  reason: string;
}

/**
 * Pure task selection algorithm for "Your Next Move":
 * 1. Unfinished Must-do in today's plan.
 * 2. Unfinished Must-do in backlog with nearest deadline / overdue.
 * 3. Remaining unfinished Must-do tasks.
 * 4. Unfinished Should-do when no Must-do remains open.
 * 5. Bonus only when no unfinished Must-do exists.
 * Never selects completed or cancelled tasks.
 */
export function selectNextMoveFromTasks(
  openTasksInput: Task[],
  plan: Plan | null,
): NextMoveCandidateResult | null {
  const openTasks = openTasksInput.filter(
    (task) => task.status === "todo" || task.status === "in_progress",
  );
  if (openTasks.length === 0) return null;

  const openPlanTasks =
    plan && plan.status !== "completed" && plan.status !== "skipped"
      ? plan.tasks.filter((pt) => !pt.completedAt && pt.status !== "completed")
      : [];

  const hasOpenMustDo =
    openPlanTasks.some((pt) => pt.kind === "must_do") ||
    openTasks.some((t) => t.kind === "must_do");

  const kindRank = (k: Task["kind"]) => (k === "must_do" ? 0 : k === "should_do" ? 1 : 2);
  const prioRank = (p: Task["priority"]) =>
    p === "urgent" ? 0 : p === "high" ? 1 : p === "medium" ? 2 : 3;
  const dueTime = (iso: string | null) =>
    iso ? new Date(iso).getTime() : Number.POSITIVE_INFINITY;

  // 1. Check unfinished Must-do in today's plan first
  const planMustDos = openPlanTasks.filter((pt) => pt.kind === "must_do");
  if (planMustDos.length > 0) {
    const sorted = [...planMustDos].sort((a, b) => {
      const taskA = openTasks.find((t) => t.id === a.taskId);
      const taskB = openTasks.find((t) => t.id === b.taskId);
      const dDiff = dueTime(taskA?.dueDate ?? null) - dueTime(taskB?.dueDate ?? null);
      if (dDiff !== 0) return dDiff;
      return prioRank(a.priority) - prioRank(b.priority);
    });
    const chosen = sorted[0]!;
    const matchingTask = openTasks.find((t) => t.id === chosen.taskId) ?? {
      id: chosen.taskId,
      title: chosen.title,
      description: chosen.description,
      category: "work",
      kind: chosen.kind,
      priority: chosen.priority,
      estimatedMinutes: Math.max(25, chosen.requiredFocusMinutes),
      requiredFocusMinutes: chosen.requiredFocusMinutes,
      dueDate: null,
      status: chosen.status,
      completedAt: chosen.completedAt,
      createdAt: new Date().toISOString(),
    };
    const remainingFocus = Math.max(0, chosen.requiredFocusMinutes - chosen.focusDone);
    const reason =
      remainingFocus > 0
        ? `Suggested because this is an unfinished Must-do task in today's plan (${formatMinutes(remainingFocus)} focus remaining).`
        : "Suggested because this is an unfinished Must-do task in today's plan.";
    return {
      task: matchingTask,
      inTodayPlan: true,
      planTaskId: chosen.id,
      focusDone: chosen.focusDone,
      focusRequired: chosen.requiredFocusMinutes,
      reason,
    };
  }

  // 2 & 3. Check unfinished Must-do in backlog (ordered by nearest deadline/overdue, then priority)
  const backlogMustDos = openTasks.filter((t) => t.kind === "must_do");
  if (backlogMustDos.length > 0) {
    const sorted = [...backlogMustDos].sort((a, b) => {
      const dDiff = dueTime(a.dueDate) - dueTime(b.dueDate);
      if (dDiff !== 0) return dDiff;
      return prioRank(a.priority) - prioRank(b.priority);
    });
    const chosen = sorted[0]!;
    return {
      task: chosen,
      inTodayPlan: false,
      planTaskId: null,
      focusDone: 0,
      focusRequired: chosen.requiredFocusMinutes,
      reason: chosen.dueDate
        ? "Suggested because this is your highest-priority unfinished Must-do with the nearest deadline."
        : "Suggested because this is your highest-priority unfinished Must-do task.",
    };
  }

  // 4. Check Should-do / Bonus in today's plan (suppressing Bonus if any Must-do is open)
  if (openPlanTasks.length > 0) {
    const eligiblePlan = hasOpenMustDo
      ? openPlanTasks.filter((pt) => pt.kind !== "bonus")
      : openPlanTasks;
    const sorted = [...eligiblePlan].sort((a, b) => {
      if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(a.kind) - kindRank(b.kind);
      const taskA = openTasks.find((t) => t.id === a.taskId);
      const taskB = openTasks.find((t) => t.id === b.taskId);
      const dDiff = dueTime(taskA?.dueDate ?? null) - dueTime(taskB?.dueDate ?? null);
      if (dDiff !== 0) return dDiff;
      return prioRank(a.priority) - prioRank(b.priority);
    });
    const chosen = sorted[0];
    if (chosen) {
      const matchingTask = openTasks.find((t) => t.id === chosen.taskId) ?? {
        id: chosen.taskId,
        title: chosen.title,
        description: chosen.description,
        category: "work",
        kind: chosen.kind,
        priority: chosen.priority,
        estimatedMinutes: Math.max(25, chosen.requiredFocusMinutes),
        requiredFocusMinutes: chosen.requiredFocusMinutes,
        dueDate: null,
        status: chosen.status,
        completedAt: chosen.completedAt,
        createdAt: new Date().toISOString(),
      };
      return {
        task: matchingTask,
        inTodayPlan: true,
        planTaskId: chosen.id,
        focusDone: chosen.focusDone,
        focusRequired: chosen.requiredFocusMinutes,
        reason:
          chosen.kind === "should_do"
            ? "Suggested because all Must-dos are clear and this Should-do is in today's plan."
            : "Suggested because your core commitments are complete and this Bonus task earns extra time.",
      };
    }
  }

  // 5. Fall back to open backlog (Should-do first, then Bonus only if no Must-do is open)
  const eligibleBacklog = hasOpenMustDo
    ? openTasks.filter((t) => t.kind !== "bonus")
    : openTasks;
  const sortedBacklog = [...eligibleBacklog].sort((a, b) => {
    if (kindRank(a.kind) !== kindRank(b.kind)) return kindRank(a.kind) - kindRank(b.kind);
    const dDiff = dueTime(a.dueDate) - dueTime(b.dueDate);
    if (dDiff !== 0) return dDiff;
    return prioRank(a.priority) - prioRank(b.priority);
  });
  const chosen = sortedBacklog[0];
  if (!chosen) return null;

  return {
    task: chosen,
    inTodayPlan: false,
    planTaskId: null,
    focusDone: 0,
    focusRequired: chosen.requiredFocusMinutes,
    reason:
      chosen.kind === "should_do"
        ? "Suggested as the highest-priority Should-do in your open work queue."
        : "Suggested because no Must-do or Should-do tasks remain open.",
  };
}

/**
 * Excludes the task already surfaced in "Your Next Move" from the "Due Soon"
 * list so a single task never appears twice on the Dashboard, and returns at
 * most `limit` open tasks with deadlines.
 */
export function filterDueSoonTasks(
  upcomingTasks: Task[],
  nextMoveTaskId: string | null | undefined,
  limit = 4,
): Task[] {
  return upcomingTasks
    .filter(
      (task) =>
        (task.status === "todo" || task.status === "in_progress") &&
        Boolean(task.dueDate) &&
        task.id !== nextMoveTaskId,
    )
    .slice(0, limit);
}

export interface WalletBreakdownSummary {
  availableMinutes: number;
  earnedMinutes: number;
  consumedMinutes: number;
  expiredMinutes: number;
  activeGrants: Grant[];
  expiredGrants: Grant[];
  nextExpiringGrant: Grant | undefined;
  hasAvailableTime: boolean;
}

export function summarizeWalletForDashboard(
  wallet: Wallet,
  now: Date = new Date(),
): WalletBreakdownSummary {
  const activeGrants = wallet.grants
    .filter((grant) => grant.status === "active" && new Date(grant.expiresAt) > now)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const expiredGrants = wallet.grants.filter(
    (grant) =>
      grant.status === "expired" ||
      (grant.status === "active" && new Date(grant.expiresAt) <= now),
  );

  // Authoritative sum of unspent minutes on expired grants — never earned - spent.
  const expiredMinutes = expiredGrants.reduce((sum, grant) => sum + grant.remainingMinutes, 0);

  return {
    availableMinutes: wallet.availableMinutes,
    earnedMinutes: wallet.earnedMinutes,
    consumedMinutes: wallet.consumedMinutes,
    expiredMinutes,
    activeGrants,
    expiredGrants,
    nextExpiringGrant: activeGrants[0],
    hasAvailableTime: wallet.availableMinutes > 0,
  };
}

export function isSidebarWalletActive(availableMinutes: number | null | undefined): boolean {
  return typeof availableMinutes === "number" && availableMinutes > 0;
}
