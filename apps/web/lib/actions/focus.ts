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

export interface FocusCompletionActionResult extends ActionState {
  verification?: {
    sessionId: string;
    actualMinutes: number;
    creditedMinutes: number;
    plannedMinutes: number;
    isValid: boolean;
    idempotent: boolean;
  };
}

export async function completeFocusAction(
  sessionId: string,
): Promise<FocusCompletionActionResult> {
  try {
    const result = await completeFocusSession(sessionId);
    revalidateWorkspace();

    if (!result.isValid) {
      return {
        success: `Session ended (${result.actualMinutes}m elapsed) — below the minimum valid focus duration, so 0m were credited.`,
        verification: result,
      };
    }

    const capped = result.creditedMinutes < result.actualMinutes;
    return {
      success: capped
        ? `Session verified — ${result.creditedMinutes} focused minutes credited (${result.actualMinutes}m total elapsed, capped at 2× planned duration).`
        : `Session verified — ${result.creditedMinutes} focused minutes credited.`,
      verification: result,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
