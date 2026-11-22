import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCAL_USER_ID, withUser, type Db } from "@/lib/db";
import { getSupabaseContext, unwrapSupabase } from "@/lib/supabase/data-client";
import type { Device, Profile, RewardSettings } from "./types";

export interface Workspace {
  profile: Profile;
  settings: RewardSettings;
  device: Device;
}

interface ProfileRow {
  id: string;
  display_name: string;
  timezone: string;
}

interface SettingsRow {
  base_minutes: number;
  bonus_minutes_per_task: number;
  extra_focus_block_minutes: number;
  extra_focus_reward_minutes: number;
  max_bonus_minutes: number;
  daily_cap_minutes: number;
  min_valid_focus_minutes: number;
}

interface DeviceRow {
  id: string;
  name: string;
  platform: string;
}

export async function ensureDevice(db: Db): Promise<Device> {
  const existing = await db.query<DeviceRow>(
    `select id, name, platform from public.devices
     where user_id = $1 and status = 'active'
     order by created_at asc limit 1`,
    [LOCAL_USER_ID],
  );
  const row = existing.rows[0];
  if (row) return { id: row.id, name: row.name, platform: row.platform };

  const created = await db.query<DeviceRow>(
    `insert into public.devices (user_id, name, platform, app_version)
     values ($1, 'Local workspace', 'web', '0.1.0') returning id, name, platform`,
    [LOCAL_USER_ID],
  );
  const device = created.rows[0];
  if (!device) throw new Error("Could not register a workspace device.");
  return { id: device.id, name: device.name, platform: device.platform };
}

export async function ensureDeviceSupabase(
  supabase: SupabaseClient,
  userId: string,
): Promise<Device> {
  const existing = unwrapSupabase(
    await supabase
      .from("devices")
      .select("id, name, platform")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(1),
  ) as DeviceRow[];

  if (existing[0]) {
    return { id: existing[0].id, name: existing[0].name, platform: existing[0].platform };
  }

  const created = unwrapSupabase(
    await supabase
      .from("devices")
      .insert({ user_id: userId, name: "Local workspace", platform: "web", app_version: "0.1.0" })
      .select("id, name, platform")
      .single(),
    "Could not register a workspace device.",
  ) as DeviceRow;

  return { id: created.id, name: created.name, platform: created.platform };
}

export const getWorkspace = cache(async (): Promise<Workspace> => {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const [profileRes, settingsRes, device] = await Promise.all([
      ctx.supabase
        .from("profiles")
        .select("id, display_name, timezone")
        .eq("id", ctx.userId)
        .maybeSingle(),
      ctx.supabase
        .from("user_settings")
        .select(
          "base_minutes, bonus_minutes_per_task, extra_focus_block_minutes, extra_focus_reward_minutes, max_bonus_minutes, daily_cap_minutes, min_valid_focus_minutes",
        )
        .eq("user_id", ctx.userId)
        .maybeSingle(),
      ensureDeviceSupabase(ctx.supabase, ctx.userId),
    ]);

    if (profileRes.error) throw new Error(profileRes.error.message);
    if (settingsRes.error) throw new Error(settingsRes.error.message);

    const profileRow = profileRes.data as ProfileRow | null;
    const settingsRow = settingsRes.data as SettingsRow | null;
    if (!profileRow || !settingsRow) {
      throw new Error("Workspace profile is missing. Please sign out and sign up again.");
    }

    return {
      profile: {
        id: profileRow.id,
        displayName: profileRow.display_name,
        timezone: profileRow.timezone,
      },
      settings: {
        baseMinutes: settingsRow.base_minutes,
        bonusMinutesPerTask: settingsRow.bonus_minutes_per_task,
        extraFocusBlockMinutes: settingsRow.extra_focus_block_minutes,
        extraFocusRewardMinutes: settingsRow.extra_focus_reward_minutes,
        maxBonusMinutes: settingsRow.max_bonus_minutes,
        dailyCapMinutes: settingsRow.daily_cap_minutes,
        minValidFocusMinutes: settingsRow.min_valid_focus_minutes,
      },
      device,
    };
  }

  return withUser(async (db) => {
    const profileResult = await db.query<ProfileRow>(
      "select id, display_name, timezone from public.profiles where id = $1",
      [LOCAL_USER_ID],
    );
    const settingsResult = await db.query<SettingsRow>(
      `select base_minutes, bonus_minutes_per_task, extra_focus_block_minutes,
              extra_focus_reward_minutes, max_bonus_minutes, daily_cap_minutes,
              min_valid_focus_minutes
       from public.user_settings where user_id = $1`,
      [LOCAL_USER_ID],
    );

    const profileRow = profileResult.rows[0];
    const settingsRow = settingsResult.rows[0];
    if (!profileRow || !settingsRow) {
      throw new Error("Workspace profile is missing. Reset the local database.");
    }

    return {
      profile: {
        id: profileRow.id,
        displayName: profileRow.display_name,
        timezone: profileRow.timezone,
      },
      settings: {
        baseMinutes: settingsRow.base_minutes,
        bonusMinutesPerTask: settingsRow.bonus_minutes_per_task,
        extraFocusBlockMinutes: settingsRow.extra_focus_block_minutes,
        extraFocusRewardMinutes: settingsRow.extra_focus_reward_minutes,
        maxBonusMinutes: settingsRow.max_bonus_minutes,
        dailyCapMinutes: settingsRow.daily_cap_minutes,
        minValidFocusMinutes: settingsRow.min_valid_focus_minutes,
      },
      device: await ensureDevice(db),
    };
  });
});
