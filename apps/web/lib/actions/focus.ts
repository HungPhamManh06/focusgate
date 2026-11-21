"use server";

import {
  cancelFocusSession,
  completeFocusSession,
  startFocusSession,
} from "@/lib/data/focus";
import { friendlyDbError } from "@/lib/data/errors";
import { focusStartSchema } from "@/lib/validation";
import { revalidateWorkspace } from "./shared";
import { firstIssue, type ActionState } from "./types";
import type { FocusMode } from "@/lib/data/types";

export async function startFocusAction(input: {
  taskId: string | null;
  mode: FocusMode;
  minutes: number;
}): Promise<ActionState> {
  const parsed = focusStartSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await startFocusSession({
      taskId: parsed.data.taskId ?? null,
      mode: parsed.data.mode,
      plannedMinutes: parsed.data.minutes,
    });
    revalidateWorkspace();
    return { success: "Focus session started." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function cancelFocusAction(sessionId: string): Promise<ActionState> {
  try {
    await cancelFocusSession(sessionId);
    revalidateWorkspace();
    return { success: "Session cancelled. Nothing was counted." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function completeFocusAction(sessionId: string): Promise<ActionState> {
  try {
    const result = await completeFocusSession(sessionId);
    revalidateWorkspace();
    return {
      success: result.isValid
        ? `Session logged — ${result.actualMinutes} focused minutes counted.`
        : `Session saved, but it did not meet the minimum valid focus time.`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
