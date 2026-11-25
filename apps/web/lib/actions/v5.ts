"use server";

import { revalidatePath } from "next/cache";
import { friendlyDbError } from "@/lib/data/errors";
import type { GateThemeId } from "@/lib/domain/gate-themes";
import { joinFocusQuest, updateV5Settings } from "@/lib/data/v5-ecosystem";
import type { ActionState } from "./types";

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/planner");
  revalidatePath("/statistics");
  revalidatePath("/settings");
}

export async function setGateThemeAction(themeId: GateThemeId): Promise<ActionState> {
  try {
    await updateV5Settings({ gateTheme: themeId });
    revalidateAll();
    return { success: "Gate material updated!" };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function joinFocusQuestAction(
  questKey: "bedtime_7d" | "deep_work_10h" | "consistency_21d",
  locale: "en" | "vi" = "vi",
): Promise<ActionState> {
  try {
    await joinFocusQuest(questKey, locale);
    revalidateAll();
    return { success: locale === "vi" ? "Đã tham gia chiến dịch thử thách!" : "Joined Focus Quest!" };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function saveV5IntegrationsAction(input: {
  calendarIcsUrl: string;
  calendarAutoLock: boolean;
  discordWebhookUrl: string;
  telegramChatId: string;
}): Promise<ActionState> {
  try {
    await updateV5Settings({
      calendarIcsUrl: input.calendarIcsUrl,
      calendarAutoLock: input.calendarAutoLock,
      discordWebhookUrl: input.discordWebhookUrl,
      telegramChatId: input.telegramChatId,
    });
    revalidateAll();
    return { success: "Integrations saved." };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}

export async function completeOnboardingAction(): Promise<ActionState> {
  try {
    await updateV5Settings({ onboardingCompleted: true });
    revalidateAll();
    return { success: "Onboarding complete!" };
  } catch (err) {
    return { error: friendlyDbError(err) };
  }
}
