"use server";

import { claimDailyReward, spendUnlockMinutes } from "@/lib/data/rewards";
import { friendlyDbError } from "@/lib/data/errors";
import { spendSchema } from "@/lib/validation";
import { revalidateWorkspace } from "./shared";
import { firstIssue, type ActionState } from "./types";

export async function claimRewardAction(planId: string): Promise<ActionState> {
  try {
    const result = await claimDailyReward(planId);
    revalidateWorkspace();
    return {
      success: result.idempotent
        ? `Today's reward was already claimed — ${result.grantedMinutes} minutes.`
        : `Unlocked ${result.grantedMinutes} minutes. Enjoy it deliberately.`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function spendMinutesAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = spendSchema.safeParse({
    grantId: formData.get("grantId") ?? "",
    minutes: formData.get("minutes") ?? 0,
    label: formData.get("label") ?? "",
  });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    const result = await spendUnlockMinutes({
      grantId: parsed.data.grantId,
      minutes: parsed.data.minutes,
      label: parsed.data.label,
    });
    revalidateWorkspace();
    return {
      success: `Logged ${parsed.data.minutes} min. ${result.remainingMinutes} min left.`,
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
