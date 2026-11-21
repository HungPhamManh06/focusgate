"use server";

import {
  activatePlan,
  addPlanTask,
  completePlan,
  completePlanTask,
  confirmPlan,
  ensureTodayPlan,
  removePlanTask,
} from "@/lib/data/planner";
import { friendlyDbError } from "@/lib/data/errors";
import { taskKinds } from "@/lib/validation";
import { revalidateWorkspace } from "./shared";
import type { ActionState } from "./types";
import type { TaskKind } from "@/lib/data/types";

export async function createPlanAction(): Promise<ActionState> {
  try {
    await ensureTodayPlan();
    revalidateWorkspace();
    return { success: "Today's plan is ready." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function addPlanTaskAction(input: {
  planId: string;
  taskId: string;
  kind: TaskKind;
}): Promise<ActionState> {
  if (!taskKinds.includes(input.kind)) return { error: "Choose a valid task type." };
  try {
    await addPlanTask(input.planId, input.taskId, input.kind);
    revalidateWorkspace();
    return { success: "Task added to today's plan." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function removePlanTaskAction(planTaskId: string): Promise<ActionState> {
  try {
    await removePlanTask(planTaskId);
    revalidateWorkspace();
    return { success: "Task removed from the plan." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function confirmPlanAction(planId: string): Promise<ActionState> {
  try {
    await confirmPlan(planId);
    revalidateWorkspace();
    return { success: "Plan confirmed. It is now locked for editing." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function activatePlanAction(planId: string): Promise<ActionState> {
  try {
    await activatePlan(planId);
    revalidateWorkspace();
    return { success: "Focus mode is active. Go do the work." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function completePlanTaskAction(planTaskId: string): Promise<ActionState> {
  try {
    await completePlanTask(planTaskId);
    revalidateWorkspace();
    return { success: "Task completed with verified focus time." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function completePlanAction(planId: string): Promise<ActionState> {
  try {
    await completePlan(planId);
    revalidateWorkspace();
    return { success: "Day complete. Your reward is ready to claim." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
