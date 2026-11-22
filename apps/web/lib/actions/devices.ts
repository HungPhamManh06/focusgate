"use server";

import { revalidatePath } from "next/cache";
import {
  registerDevice,
  renameDevice,
  revokeDevice,
  type DevicePlatform,
} from "@/lib/data/devices";
import { friendlyDbError } from "@/lib/data/errors";
import { deviceRegisterSchema, deviceRenameSchema } from "@/lib/validation";
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
