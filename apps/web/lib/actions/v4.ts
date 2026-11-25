"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/data/errors";
import { addPlanTask, ensureTodayPlan } from "@/lib/data/planner";
import { createTask } from "@/lib/data/tasks";
import type { TaskCategory, TaskKind } from "@/lib/data/types";
import {
  acceptPartnerInvite,
  createPartnerInvite,
  createRecurringRule,
  deleteRecurringRule,
  listPlanTemplates,
  listRecurringRules,
  saveWeeklyReview,
  sendPartnerCheer,
} from "@/lib/data/v4-ecosystem";
import { buildMicroStepsForStalledTask } from "@/lib/domain/focus-coach";
import type { ActionState } from "./types";

type ActionResult<T = undefined> = ActionState & { data?: T };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/planner");
  revalidatePath("/tasks");
  revalidatePath("/statistics");
  revalidatePath("/focus");
}

export async function applyPlanTemplateAction(
  templateId: string,
  locale: "en" | "vi" = "vi",
): Promise<ActionResult> {
  try {
    const templates = await listPlanTemplates(locale);
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return { error: "Template not found." };

    const planId = await ensureTodayPlan();
    for (const item of tpl.items) {
      const title = locale === "vi" && item.titleVi ? item.titleVi : item.title;
      const created = await createTask({
        title,
        description: null,
        category: item.category,
        priority: item.kind === "must_do" ? "high" : "medium",
        kind: item.kind,
        estimatedMinutes: item.estimatedMinutes,
        requiredFocusMinutes: item.kind === "must_do" ? Math.min(item.estimatedMinutes, 45) : 0,
        dueDate: null,
      });
      await addPlanTask(planId, created.id, item.kind);
    }
    revalidateAll();
    return {
      success:
        locale === "vi"
          ? `Đã nạp mẫu "${tpl.name}" (${tpl.items.length} việc) vào kế hoạch hôm nay.`
          : `Applied "${tpl.name}" (${tpl.items.length} tasks) to today's plan.`,
    };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function createRecurringRuleAction(input: {
  title: string;
  category: TaskCategory;
  kind: TaskKind;
  estimatedMinutes: number;
  recurrenceType: "daily" | "weekdays" | "custom";
  daysOfWeek: number[];
}): Promise<ActionResult> {
  if (!input.title.trim()) return { error: "Title is required." };
  try {
    await createRecurringRule(input);
    revalidateAll();
    return { success: "Recurring rule saved." };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function deleteRecurringRuleAction(ruleId: string): Promise<ActionResult> {
  try {
    await deleteRecurringRule(ruleId);
    revalidateAll();
    return { success: "Recurring rule removed." };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function spawnTodayRecurringTasksAction(): Promise<ActionResult> {
  try {
    const rules = (await listRecurringRules()).filter((r) => r.active);
    const jsDay = new Date().getDay(); // 0=Sun..6=Sat
    const isoDay = jsDay === 0 ? 7 : jsDay; // 1=Mon..7=Sun
    const matching = rules.filter((r) => {
      if (r.recurrenceType === "daily") return true;
      if (r.recurrenceType === "weekdays") return isoDay >= 1 && isoDay <= 5;
      return r.daysOfWeek.includes(isoDay);
    });
    if (matching.length === 0) {
      return { success: "No recurring tasks scheduled for today." };
    }
    const planId = await ensureTodayPlan();
    for (const rule of matching) {
      const created = await createTask({
        title: rule.title,
        description: null,
        category: rule.category,
        priority: rule.kind === "must_do" ? "high" : "medium",
        kind: rule.kind,
        estimatedMinutes: rule.estimatedMinutes,
        requiredFocusMinutes: rule.kind === "must_do" ? Math.min(rule.estimatedMinutes, 30) : 0,
        dueDate: null,
      });
      await addPlanTask(planId, created.id, rule.kind);
    }
    revalidateAll();
    return { success: `Added ${matching.length} recurring task(s) to today's plan.` };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function splitStalledTaskAction(taskTitle: string): Promise<ActionResult> {
  try {
    const steps = buildMicroStepsForStalledTask(taskTitle);
    const planId = await ensureTodayPlan();
    for (const step of steps) {
      const created = await createTask({
        title: step.title,
        description: null,
        category: step.category,
        priority: "high",
        kind: step.kind,
        estimatedMinutes: step.estimatedMinutes,
        requiredFocusMinutes: step.estimatedMinutes,
        dueDate: null,
      });
      await addPlanTask(planId, created.id, step.kind);
    }
    revalidateAll();
    return { success: `Split into ${steps.length} micro-steps and added to today's plan.` };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function saveWeeklyReviewAction(input: {
  weekStart: string;
  proudestWin: string;
  reflectionNote: string;
  archiveTaskIds: string[];
}): Promise<ActionResult> {
  try {
    await saveWeeklyReview(input);
    revalidateAll();
    return { success: "Weekly Review saved." };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function createPartnerInviteAction(): Promise<ActionResult<{ code: string }>> {
  try {
    const code = await createPartnerInvite();
    revalidateAll();
    return { success: `Invite code created: ${code}`, data: { code } };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function acceptPartnerInviteAction(code: string): Promise<ActionResult> {
  if (!code.trim()) return { error: "Please enter an invite code." };
  try {
    await acceptPartnerInvite(code);
    revalidateAll();
    return { success: "Paired with your accountability partner!" };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function sendPartnerCheerAction(
  partnerUserId: string,
  message: string,
): Promise<ActionResult> {
  try {
    await sendPartnerCheer(partnerUserId, message);
    revalidateAll();
    return { success: "Cheer sent!" };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}
