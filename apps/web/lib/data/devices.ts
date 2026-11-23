import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { computeAgentPolicySnapshot, type AgentPolicyPayload } from "@/lib/domain/agent-policy";
import {
  assertSupabaseOk,
  getSupabaseContext,
  getSupabaseUserTimezone,
  localDateInTimezone,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { toIso } from "./format";
import { getV2Settings } from "./v2-settings";

export type DevicePlatform = "windows" | "android" | "web";
export type DeviceStatus = "active" | "revoked";

export interface DeviceRecord {
  id: string;
  name: string;
  platform: DevicePlatform;
  osVersion: string | null;
  appVersion: string | null;
  status: DeviceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

interface DeviceTableRow {
  id: string;
  name: string;
  platform: DevicePlatform;
  os_version: string | null;
  app_version: string | null;
  status: DeviceStatus;
  last_seen_at: string | Date | null;
  created_at: string | Date;
}

function mapDevice(row: DeviceTableRow): DeviceRecord {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    osVersion: row.os_version,
    appVersion: row.app_version,
    status: row.status,
    lastSeenAt: toIso(row.last_seen_at),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
  };
}

export async function listDevices(): Promise<DeviceRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("devices")
        .select("id, name, platform, os_version, app_version, status, last_seen_at, created_at")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: true }),
    ) as DeviceTableRow[];

    return rows.map(mapDevice).sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (a.lastSeenAt && b.lastSeenAt) {
        const seenDiff = b.lastSeenAt.localeCompare(a.lastSeenAt);
        if (seenDiff !== 0) return seenDiff;
      } else if (a.lastSeenAt) {
        return -1;
      } else if (b.lastSeenAt) {
        return 1;
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
  }

  return withUser(async (db) => {
    const result = await db.query<DeviceTableRow>(
      `select id, name, platform, os_version, app_version, status, last_seen_at, created_at
       from public.devices
       where user_id = $1
       order by
         case status when 'active' then 0 else 1 end,
         last_seen_at desc nulls last,
         created_at asc`,
      [LOCAL_USER_ID],
    );
    return result.rows.map(mapDevice);
  });
}

export async function registerDevice(input: {
  name: string;
  platform: DevicePlatform;
}): Promise<DeviceRecord> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const row = unwrapSupabase(
      await ctx.supabase
        .from("devices")
        .insert({
          user_id: ctx.userId,
          name: input.name,
          platform: input.platform,
          app_version: "0.1.0",
        })
        .select("id, name, platform, os_version, app_version, status, last_seen_at, created_at")
        .single(),
      "Could not register device.",
    ) as DeviceTableRow;
    return mapDevice(row);
  }

  return withUser(async (db) => {
    const result = await db.query<DeviceTableRow>(
      `insert into public.devices (user_id, name, platform, app_version)
       values ($1, $2, $3::public.device_platform, '0.1.0')
       returning id, name, platform, os_version, app_version, status, last_seen_at, created_at`,
      [LOCAL_USER_ID, input.name, input.platform],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Could not register device.");
    return mapDevice(row);
  });
}

export async function renameDevice(deviceId: string, name: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("devices")
        .update({ name })
        .eq("id", deviceId)
        .eq("user_id", ctx.userId)
        .select("id"),
    ) as Array<{ id: string }>;
    if (rows.length === 0) throw new Error("Device not found.");
    return;
  }

  await withUser(async (db) => {
    const result = await db.query<{ id: string }>(
      `update public.devices
       set name = $1
       where id = $2 and user_id = $3
       returning id`,
      [name, deviceId, LOCAL_USER_ID],
    );
    if (result.rows.length === 0) {
      throw new Error("Device not found.");
    }
  });
}

export async function revokeDevice(deviceId: string): Promise<{ revokedGrants: number }> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const res = await ctx.supabase.rpc("rpc_revoke_device", { p_device_id: deviceId });
    assertSupabaseOk(res);
    const data = res.data as { revokedGrants?: number } | null;
    return { revokedGrants: data?.revokedGrants ?? 0 };
  }

  return withUser(async (db) => {
    const result = await db.query<{ result: { revoked: boolean; revokedGrants: number } }>(
      "select public.rpc_revoke_device($1) as result",
      [deviceId],
    );
    return { revokedGrants: result.rows[0]?.result?.revokedGrants ?? 0 };
  });
}

export async function upsertDeviceRegistration(
  input: {
    name: string;
    platform: DevicePlatform;
    osVersion?: string | null;
    appVersion?: string | null;
  },
  request?: Request,
): Promise<DeviceRecord> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { data: found, error: findErr } = await ctx.supabase
      .from("devices")
      .select("id, name, platform, os_version, app_version, status, last_seen_at, created_at")
      .eq("user_id", ctx.userId)
      .eq("name", input.name)
      .maybeSingle();
    if (findErr) throw new Error(findErr.message);

    if (found) {
      const existingRow = found as DeviceTableRow;
      if (existingRow.status === "revoked") {
        throw new Error("forbidden: this device name was revoked; register a new device name.");
      }
      const updated = unwrapSupabase(
        await ctx.supabase
          .from("devices")
          .update({
            platform: input.platform,
            os_version: input.osVersion ?? existingRow.os_version,
            app_version: input.appVersion ?? existingRow.app_version,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existingRow.id)
          .eq("user_id", ctx.userId)
          .select("id, name, platform, os_version, app_version, status, last_seen_at, created_at")
          .single(),
      ) as DeviceTableRow;
      return mapDevice(updated);
    }

    const created = unwrapSupabase(
      await ctx.supabase
        .from("devices")
        .insert({
          user_id: ctx.userId,
          name: input.name,
          platform: input.platform,
          os_version: input.osVersion ?? null,
          app_version: input.appVersion ?? "0.1.0",
          last_seen_at: new Date().toISOString(),
        })
        .select("id, name, platform, os_version, app_version, status, last_seen_at, created_at")
        .single(),
      "Could not register device.",
    ) as DeviceTableRow;
    return mapDevice(created);
  }

  return withUser(async (db) => {
    const existing = await db.query<DeviceTableRow>(
      `select id, name, platform, os_version, app_version, status, last_seen_at, created_at
       from public.devices
       where user_id = $1 and name = $2
       limit 1`,
      [LOCAL_USER_ID, input.name],
    );
    const found = existing.rows[0];
    if (found) {
      if (found.status === "revoked") {
        throw new Error("forbidden: this device name was revoked; register a new device name.");
      }
      const updated = await db.query<DeviceTableRow>(
        `update public.devices
         set platform = $2::public.device_platform,
             os_version = coalesce($3, os_version),
             app_version = coalesce($4, app_version),
             last_seen_at = now()
         where id = $1 and user_id = $5
         returning id, name, platform, os_version, app_version, status, last_seen_at, created_at`,
        [found.id, input.platform, input.osVersion ?? null, input.appVersion ?? null, LOCAL_USER_ID],
      );
      return mapDevice(updated.rows[0] ?? found);
    }

    const created = await db.query<DeviceTableRow>(
      `insert into public.devices (user_id, name, platform, os_version, app_version, last_seen_at)
       values ($1, $2, $3::public.device_platform, $4, $5, now())
       returning id, name, platform, os_version, app_version, status, last_seen_at, created_at`,
      [
        LOCAL_USER_ID,
        input.name,
        input.platform,
        input.osVersion ?? null,
        input.appVersion ?? "0.1.0",
      ],
    );
    const row = created.rows[0];
    if (!row) throw new Error("Could not register device.");
    return mapDevice(row);
  });
}

export async function getAgentPolicyForDevice(
  deviceId: string,
  request?: Request,
): Promise<{ status: "ok"; policy: AgentPolicyPayload } | { status: "forbidden" }> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { data: device, error: devErr } = await ctx.supabase
      .from("devices")
      .select("id, status")
      .eq("id", deviceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (devErr) throw new Error(devErr.message);
    if (!device || device.status !== "active") {
      return { status: "forbidden" };
    }

    const timezone = await getSupabaseUserTimezone(ctx.supabase, ctx.userId);
    const today = localDateInTimezone(timezone);
    const weekdayNum = new Date(`${today}T12:00:00Z`).getUTCDay();
    const isWeekend = weekdayNum === 0 || weekdayNum === 6;

    const [, grantsRes, rulesRes, todayPlanRes, v2, activeFocusRes] = await Promise.all([
      ctx.supabase
        .from("devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", deviceId)
        .eq("user_id", ctx.userId),
      ctx.supabase
        .from("unlock_grants")
        .select("remaining_minutes")
        .eq("user_id", ctx.userId)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .gt("remaining_minutes", 0),
      ctx.supabase
        .from("block_rules")
        .select("rule_type, identifier, is_enabled")
        .eq("user_id", ctx.userId)
        .eq("device_id", deviceId)
        .order("identifier", { ascending: true }),
      ctx.supabase
        .from("daily_plans")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("plan_date", today)
        .maybeSingle(),
      getV2Settings(request),
      ctx.supabase
        .from("focus_sessions")
        .select("id, status, tasks(title)")
        .eq("user_id", ctx.userId)
        .in("status", ["running", "paused"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const grantRows = unwrapSupabase(grantsRes) as Array<{ remaining_minutes: number }>;
    const ruleRows = unwrapSupabase(rulesRes) as Array<{
      rule_type: "block" | "allow";
      identifier: string;
      is_enabled: boolean;
    }>;

    let hasPlannedTasks = false;
    let allPlanTasksCompleted = false;
    const planId = (todayPlanRes.data as { id?: string } | null)?.id;
    if (planId) {
      const planTasksRes = await ctx.supabase
        .from("daily_plan_tasks")
        .select("tasks!inner(status)")
        .eq("plan_id", planId)
        .eq("user_id", ctx.userId);
      const planTaskRows = unwrapSupabase(planTasksRes) as Array<{
        tasks: { status: string } | Array<{ status: string }>;
      }>;
      if (planTaskRows.length > 0) {
        hasPlannedTasks = true;
        allPlanTasksCompleted = planTaskRows.every((row) => {
          const t = Array.isArray(row.tasks) ? row.tasks[0] : row.tasks;
          return t?.status === "completed";
        });
      }
    }

    const activeFocusRow = activeFocusRes.data as {
      id: string;
      status: string;
      tasks: { title: string } | Array<{ title: string }> | null;
    } | null;
    const focusTask = activeFocusRow?.tasks
      ? Array.isArray(activeFocusRow.tasks)
        ? activeFocusRow.tasks[0]
        : activeFocusRow.tasks
      : null;

    const activeGrantMinutes = grantRows.reduce((sum, row) => sum + row.remaining_minutes, 0);
    const policy = computeAgentPolicySnapshot({
      activeGrantMinutes,
      rules: ruleRows.map((row) => ({
        ruleType: row.rule_type,
        identifier: row.identifier,
        isEnabled: row.is_enabled,
      })),
      unlockPassUntil: v2.unlockPassUntil,
      whitelistFocusMode: v2.whitelistFocusMode,
      allowedApps: v2.allowedApps,
      allowedDomains: v2.allowedDomains,
      blockedDomains: v2.blockedDomains,
      activeFocusSession: activeFocusRow
        ? {
            id: activeFocusRow.id,
            status: activeFocusRow.status,
            taskTitle: focusTask?.title ?? null,
          }
        : null,
      effectiveSchedule: {
        isWeekend,
        bedtimeStart: isWeekend ? v2.weekendBedtimeStart : v2.weekdayBedtimeStart,
        bedtimeEnd: isWeekend ? v2.weekendBedtimeEnd : v2.weekdayBedtimeEnd,
        relaxedMode: isWeekend && v2.weekendRelaxedMode,
      },
      earnedMinutesBalance: v2.earnedMinutesBalance,
    });

    const hasUnlockPass =
      Boolean(v2.unlockPassUntil) && new Date(v2.unlockPassUntil!).getTime() > Date.now();
    if (hasPlannedTasks && !hasUnlockPass && !(isWeekend && v2.weekendRelaxedMode)) {
      policy.lockActive = !allPlanTasksCompleted;
    }

    return { status: "ok", policy };
  }

  return withUser(async (db) => {
    const devRes = await db.query<{ id: string; status: DeviceStatus }>(
      `select id, status
       from public.devices
       where id = $1 and user_id = $2
       limit 1`,
      [deviceId, LOCAL_USER_ID],
    );
    const device = devRes.rows[0];
    if (!device || device.status !== "active") {
      return { status: "forbidden" };
    }

    await db.query(
      "update public.devices set last_seen_at = now() where id = $1 and user_id = $2",
      [deviceId, LOCAL_USER_ID],
    );

    const [grantsRes, rulesRes] = await Promise.all([
      db.query<{ remaining: number }>(
        `select coalesce(sum(remaining_minutes), 0)::int as remaining
         from public.unlock_grants
         where user_id = $1
           and status = 'active'
           and expires_at > now()
           and remaining_minutes > 0`,
        [LOCAL_USER_ID],
      ),
      db.query<{ rule_type: "block" | "allow"; identifier: string; is_enabled: boolean }>(
        `select rule_type, identifier, is_enabled
         from public.block_rules
         where user_id = $1 and device_id = $2
         order by identifier asc`,
        [LOCAL_USER_ID, deviceId],
      ),
    ]);

    const activeGrantMinutes = grantsRes.rows[0]?.remaining ?? 0;
    const policy = computeAgentPolicySnapshot({
      activeGrantMinutes,
      rules: rulesRes.rows.map((row) => ({
        ruleType: row.rule_type,
        identifier: row.identifier,
        isEnabled: row.is_enabled,
      })),
    });

    return { status: "ok", policy };
  });
}

export interface BlockRuleRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  platform: DevicePlatform;
  ruleType: "block" | "allow";
  identifier: string;
  displayName: string;
  category: "social" | "video" | "games" | "entertainment" | "other";
  action: "overlay" | "minimize" | "terminate" | "notify";
  isEnabled: boolean;
}

export async function listBlockRules(): Promise<BlockRuleRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("block_rules")
        .select(
          "id, device_id, platform, rule_type, identifier, display_name, category, action, is_enabled, devices!inner(name)",
        )
        .eq("user_id", ctx.userId),
    ) as Array<{
      id: string;
      device_id: string;
      platform: DevicePlatform;
      rule_type: "block" | "allow";
      identifier: string;
      display_name: string;
      category: BlockRuleRecord["category"];
      action: BlockRuleRecord["action"];
      is_enabled: boolean;
      devices: { name: string } | Array<{ name: string }>;
    }>;

    return rows
      .map((row) => {
        const dev = Array.isArray(row.devices) ? row.devices[0]! : row.devices;
        return {
          id: row.id,
          deviceId: row.device_id,
          deviceName: dev.name,
          platform: row.platform,
          ruleType: row.rule_type,
          identifier: row.identifier,
          displayName: row.display_name,
          category: row.category,
          action: row.action,
          isEnabled: row.is_enabled,
        };
      })
      .sort((a, b) => {
        if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
        const devDiff = a.deviceName.localeCompare(b.deviceName);
        if (devDiff !== 0) return devDiff;
        return a.displayName.localeCompare(b.displayName);
      });
  }

  return withUser(async (db) => {
    const result = await db.query<{
      id: string;
      device_id: string;
      device_name: string;
      platform: DevicePlatform;
      rule_type: "block" | "allow";
      identifier: string;
      display_name: string;
      category: BlockRuleRecord["category"];
      action: BlockRuleRecord["action"];
      is_enabled: boolean;
    }>(
      `select r.id, r.device_id, d.name as device_name, r.platform, r.rule_type,
              r.identifier, r.display_name, r.category, r.action, r.is_enabled
       from public.block_rules r
       join public.devices d on d.id = r.device_id and d.user_id = r.user_id
       where r.user_id = $1
       order by r.is_enabled desc, d.name asc, r.display_name asc`,
      [LOCAL_USER_ID],
    );

    return result.rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      deviceName: row.device_name,
      platform: row.platform,
      ruleType: row.rule_type,
      identifier: row.identifier,
      displayName: row.display_name,
      category: row.category,
      action: row.action,
      isEnabled: row.is_enabled,
    }));
  });
}

export async function createBlockRule(input: {
  deviceId: string;
  ruleType: "block" | "allow";
  identifier: string;
  displayName: string;
  category: BlockRuleRecord["category"];
  action: BlockRuleRecord["action"];
}): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { data: device, error } = await ctx.supabase
      .from("devices")
      .select("platform")
      .eq("id", input.deviceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!device) throw new Error("Device not found.");

    assertSupabaseOk(
      await ctx.supabase.from("block_rules").insert({
        user_id: ctx.userId,
        device_id: input.deviceId,
        platform: device.platform,
        rule_type: input.ruleType,
        identifier: input.identifier,
        display_name: input.displayName,
        category: input.category,
        action: input.action,
      }),
    );
    return;
  }

  await withUser(async (db) => {
    const dev = await db.query<{ platform: DevicePlatform }>(
      "select platform from public.devices where id = $1 and user_id = $2",
      [input.deviceId, LOCAL_USER_ID],
    );
    const device = dev.rows[0];
    if (!device) throw new Error("Device not found.");

    await db.query(
      `insert into public.block_rules
         (user_id, device_id, platform, rule_type, identifier, display_name, category, action)
       values
         ($1, $2, $3::public.device_platform, $4::public.block_rule_type, $5, $6,
          $7::public.block_category, $8::public.block_action)`,
      [
        LOCAL_USER_ID,
        input.deviceId,
        device.platform,
        input.ruleType,
        input.identifier,
        input.displayName,
        input.category,
        input.action,
      ],
    );
  });
}

export async function toggleBlockRule(ruleId: string, isEnabled: boolean): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase
        .from("block_rules")
        .update({ is_enabled: isEnabled })
        .eq("id", ruleId)
        .eq("user_id", ctx.userId),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query(
      "update public.block_rules set is_enabled = $1 where id = $2 and user_id = $3",
      [isEnabled, ruleId, LOCAL_USER_ID],
    );
  });
}

export async function deleteBlockRule(ruleId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    assertSupabaseOk(
      await ctx.supabase
        .from("block_rules")
        .delete()
        .eq("id", ruleId)
        .eq("user_id", ctx.userId),
    );
    return;
  }

  await withUser(async (db) => {
    await db.query("delete from public.block_rules where id = $1 and user_id = $2", [
      ruleId,
      LOCAL_USER_ID,
    ]);
  });
}

export interface UsageEventRecord {
  id: string;
  deviceId: string;
  deviceName: string;
  identifier: string;
  displayName: string | null;
  startedAt: string;
  durationSeconds: number;
  wasBlocked: boolean;
}

export async function listRecentUsageEvents(limit = 15): Promise<UsageEventRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const rows = unwrapSupabase(
      await ctx.supabase
        .from("usage_events")
        .select(
          "id, device_id, identifier, display_name, started_at, duration_seconds, was_blocked, devices!inner(name)",
        )
        .eq("user_id", ctx.userId)
        .order("started_at", { ascending: false })
        .limit(limit),
    ) as Array<{
      id: string;
      device_id: string;
      identifier: string;
      display_name: string | null;
      started_at: string;
      duration_seconds: number;
      was_blocked: boolean;
      devices: { name: string } | Array<{ name: string }>;
    }>;

    return rows.map((row) => {
      const dev = Array.isArray(row.devices) ? row.devices[0]! : row.devices;
      return {
        id: row.id,
        deviceId: row.device_id,
        deviceName: dev.name,
        identifier: row.identifier,
        displayName: row.display_name,
        startedAt: toIso(row.started_at) ?? new Date().toISOString(),
        durationSeconds: row.duration_seconds,
        wasBlocked: row.was_blocked,
      };
    });
  }

  return withUser(async (db) => {
    const result = await db.query<{
      id: string;
      device_id: string;
      device_name: string;
      identifier: string;
      display_name: string | null;
      started_at: string | Date;
      duration_seconds: number;
      was_blocked: boolean;
    }>(
      `select u.id, u.device_id, d.name as device_name, u.identifier, u.display_name,
              u.started_at, u.duration_seconds, u.was_blocked
       from public.usage_events u
       join public.devices d on d.id = u.device_id and d.user_id = u.user_id
       where u.user_id = $1
       order by u.started_at desc
       limit $2`,
      [LOCAL_USER_ID, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      deviceName: row.device_name,
      identifier: row.identifier,
      displayName: row.display_name,
      startedAt: toIso(row.started_at) ?? new Date().toISOString(),
      durationSeconds: row.duration_seconds,
      wasBlocked: row.was_blocked,
    }));
  });
}

export async function ingestUsageEvents(
  input: {
    deviceId: string;
    events: ReadonlyArray<{
      clientEventId: string;
      identifier: string;
      displayName?: string | null;
      startedAt: string;
      endedAt?: string | null;
      durationSeconds: number;
      wasBlocked: boolean;
    }>;
  },
  request?: Request,
): Promise<{ status: "ok"; accepted: number; duplicates: number } | { status: "forbidden" }> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { data: device, error: devErr } = await ctx.supabase
      .from("devices")
      .select("status")
      .eq("id", input.deviceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (devErr) throw new Error(devErr.message);
    if (!device || device.status !== "active") {
      return { status: "forbidden" };
    }

    let accepted = 0;
    if (input.events.length > 0) {
      const payload = input.events.map((evt) => ({
        user_id: ctx.userId,
        device_id: input.deviceId,
        client_event_id: evt.clientEventId,
        identifier: evt.identifier,
        display_name: evt.displayName ?? null,
        started_at: evt.startedAt,
        ended_at: evt.endedAt ?? null,
        duration_seconds: evt.durationSeconds,
        was_blocked: evt.wasBlocked,
      }));
      const inserted = unwrapSupabase(
        await ctx.supabase
          .from("usage_events")
          .upsert(payload, { onConflict: "device_id,client_event_id", ignoreDuplicates: true })
          .select("id"),
      ) as Array<{ id: string }>;
      accepted = inserted.length;
    }

    assertSupabaseOk(
      await ctx.supabase
        .from("devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", input.deviceId)
        .eq("user_id", ctx.userId),
    );

    return {
      status: "ok",
      accepted,
      duplicates: input.events.length - accepted,
    };
  }

  return withUser(async (db) => {
    const devRes = await db.query<{ status: DeviceStatus }>(
      "select status from public.devices where id = $1 and user_id = $2 limit 1",
      [input.deviceId, LOCAL_USER_ID],
    );
    const device = devRes.rows[0];
    if (!device || device.status !== "active") {
      return { status: "forbidden" };
    }

    let accepted = 0;
    let duplicates = 0;

    for (const evt of input.events) {
      const inserted = await db.query<{ id: string }>(
        `insert into public.usage_events
           (user_id, device_id, client_event_id, identifier, display_name,
            started_at, ended_at, duration_seconds, was_blocked)
         values
           ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9)
         on conflict (device_id, client_event_id) do nothing
         returning id`,
        [
          LOCAL_USER_ID,
          input.deviceId,
          evt.clientEventId,
          evt.identifier,
          evt.displayName ?? null,
          evt.startedAt,
          evt.endedAt ?? null,
          evt.durationSeconds,
          evt.wasBlocked,
        ],
      );
      if (inserted.rows.length > 0) accepted += 1;
      else duplicates += 1;
    }

    await db.query(
      "update public.devices set last_seen_at = now() where id = $1 and user_id = $2",
      [input.deviceId, LOCAL_USER_ID],
    );

    return { status: "ok", accepted, duplicates };
  });
}
