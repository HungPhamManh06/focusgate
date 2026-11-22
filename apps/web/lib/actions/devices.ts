"use server";

import { revalidatePath } from "next/cache";
import {
  createBlockRule,
  deleteBlockRule,
  registerDevice,
  renameDevice,
  revokeDevice,
  toggleBlockRule,
  type BlockRuleRecord,
  type DevicePlatform,
} from "@/lib/data/devices";
import { friendlyDbError } from "@/lib/data/errors";
import { blockRuleSchema, deviceRegisterSchema, deviceRenameSchema } from "@/lib/validation";
import { revalidateWorkspace } from "./shared";
import { firstIssue, type ActionState } from "./types";

export async function registerDeviceAction(input: {
  name: string;
  platform: DevicePlatform;
}): Promise<ActionState> {
  const parsed = deviceRegisterSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await registerDevice(parsed.data);
    revalidatePath("/devices");
    revalidateWorkspace();
    return { success: `Device "${parsed.data.name}" registered.` };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function renameDeviceAction(input: {
  deviceId: string;
  name: string;
}): Promise<ActionState> {
  const parsed = deviceRenameSchema.safeParse({ name: input.name });
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await renameDevice(input.deviceId, parsed.data.name);
    revalidatePath("/devices");
    revalidateWorkspace();
    return { success: "Device renamed." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function revokeDeviceAction(deviceId: string): Promise<ActionState> {
  try {
    const { revokedGrants } = await revokeDevice(deviceId);
    revalidatePath("/devices");
    revalidateWorkspace();
    return {
      success:
        revokedGrants > 0
          ? `Device revoked (${revokedGrants} active grant${revokedGrants === 1 ? "" : "s"} revoked).`
          : "Device revoked.",
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function createBlockRuleAction(input: {
  deviceId: string;
  ruleType: "block" | "allow";
  identifier: string;
  displayName: string;
  category: BlockRuleRecord["category"];
  action: BlockRuleRecord["action"];
}): Promise<ActionState> {
  const parsed = blockRuleSchema.safeParse(input);
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await createBlockRule(parsed.data);
    revalidatePath("/devices");
    return { success: `Rule "${parsed.data.displayName}" added.` };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function toggleBlockRuleAction(ruleId: string, isEnabled: boolean): Promise<ActionState> {
  try {
    await toggleBlockRule(ruleId, isEnabled);
    revalidatePath("/devices");
    return { success: isEnabled ? "Rule enabled." : "Rule paused." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function deleteBlockRuleAction(ruleId: string): Promise<ActionState> {
  try {
    await deleteBlockRule(ruleId);
    revalidatePath("/devices");
    return { success: "Rule deleted." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
