"use server";

import { friendlyDbError } from "@/lib/data/errors";
import { addPlanTask, ensureTodayPlan } from "@/lib/data/planner";
import { createTask } from "@/lib/data/tasks";
import {
  activateUnlockPass,
  buyStreakFreeze,
  rolloverIncompleteTasks,
  updateV2Settings,
  useStreakFreeze,
} from "@/lib/data/v2-settings";
import { upsertDailyHealthMetrics } from "@/lib/data/health";
import { breakdownGoalIntoTasks } from "@/lib/domain/smart-breakdown";
import { revalidateWorkspace } from "./shared";
import type { ActionState } from "./types";

export async function activateUnlockPassAction(minutes = 10): Promise<ActionState> {
  try {
    const res = await activateUnlockPass(minutes);
    revalidateWorkspace();
    return {
      success: `Unlock Pass active for ${res.consumedMinutes} minutes (${res.earnedMinutesBalance}m remaining).`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function buyStreakFreezeAction(): Promise<ActionState> {
  try {
    const res = await buyStreakFreeze();
    revalidateWorkspace();
    return {
      success: `Bought 1 Streak Freeze! You now have ${res.streakFreezeCount}.`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function useStreakFreezeAction(day: string): Promise<ActionState> {
  try {
    const res = await useStreakFreeze(day);
    revalidateWorkspace();
    return {
      success: `Streak Freeze applied to ${day}. Remaining: ${res.streakFreezeCount}.`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function rolloverTasksAction(
  fromDate: string,
  toDate: string,
): Promise<ActionState> {
  try {
    const res = await rolloverIncompleteTasks(fromDate, toDate);
    revalidateWorkspace();
    return res.moved > 0
      ? { success: `Rolled over ${res.moved} incomplete task${res.moved === 1 ? "" : "s"}.` }
      : { success: "No incomplete tasks needed to roll over." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function smartBreakdownAction(
  goal: string,
  addToToday = true,
): Promise<ActionState> {
  const subtasks = breakdownGoalIntoTasks(goal);
  if (subtasks.length === 0) {
    return { error: "Please enter a goal to break down." };
  }
  try {
    const planId = addToToday ? await ensureTodayPlan() : null;
    for (const sub of subtasks) {
      const task = await createTask({
        title: sub.title,
        description: `Auto-generated from goal: ${goal.trim()}`,
        category: sub.category,
        kind: sub.kind,
        priority: sub.kind === "must_do" ? "high" : "medium",
        estimatedMinutes: sub.estimatedMinutes,
        requiredFocusMinutes: 0,
        dueDate: null,
        isDailyHabit: false,
      });
      if (planId) {
        try {
          await addPlanTask(planId, task.id, sub.kind);
        } catch {
          // If plan is already active/completed, task still remains in Tasks list.
        }
      }
    }
    revalidateWorkspace();
    return {
      success: `Created ${subtasks.length} tasks from "${goal.trim()}".`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function updateV2SettingsAction(input: {
  whitelistFocusMode?: boolean;
  allowedApps?: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  weekdayBedtimeStart?: string | null;
  weekdayBedtimeEnd?: string | null;
  weekendBedtimeStart?: string | null;
  weekendBedtimeEnd?: string | null;
  weekendRelaxedMode?: boolean;
  lastDailyReviewDate?: string | null;
}): Promise<ActionState> {
  try {
    await updateV2Settings(input);
    revalidateWorkspace();
    return { success: "Settings updated." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function saveManualHealthMetricAction(input: {
  date: string;
  steps: number;
  activeCalories: number;
  sleepHours: number;
  weightKg: number | null;
}): Promise<ActionState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: "Chọn ngày hợp lệ (YYYY-MM-DD)." };
  }
  try {
    await upsertDailyHealthMetrics({
      metrics: [
        {
          date: input.date,
          steps: Math.max(0, Math.round(input.steps)),
          activeCalories: Math.max(0, Math.round(input.activeCalories)),
          sleepMinutes: Math.max(0, Math.round(input.sleepHours * 60)),
          weightKg:
            input.weightKg !== null && Number.isFinite(input.weightKg) && input.weightKg > 0
              ? input.weightKg
              : null,
          source: "manual",
        },
      ],
    });
    revalidateWorkspace();
    return { success: `Đã lưu chỉ số sức khỏe ngày ${input.date}.` };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
