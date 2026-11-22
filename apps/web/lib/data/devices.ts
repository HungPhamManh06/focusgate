import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { computeAgentPolicySnapshot, type AgentPolicyPayload } from "@/lib/domain/agent-policy";
import { toIso } from "./format";

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
  return withUser(async (db) => {
    const result = await db.query<{ result: { revoked: boolean; revokedGrants: number } }>(
      "select public.rpc_revoke_device($1) as result",
      [deviceId],
    );
    return { revokedGrants: result.rows[0]?.result?.revokedGrants ?? 0 };
  });
}

export async function upsertDeviceRegistration(input: {
  name: string;
  platform: DevicePlatform;
  osVersion?: string | null;
  appVersion?: string | null;
}): Promise<DeviceRecord> {
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
): Promise<{ status: "ok"; policy: AgentPolicyPayload } | { status: "forbidden" }> {
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
  await withUser(async (db) => {
    await db.query(
      "update public.block_rules set is_enabled = $1 where id = $2 and user_id = $3",
      [isEnabled, ruleId, LOCAL_USER_ID],
    );
  });
}

export async function deleteBlockRule(ruleId: string): Promise<void> {
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

export async function ingestUsageEvents(input: {
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
}): Promise<{ status: "ok"; accepted: number; duplicates: number } | { status: "forbidden" }> {
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
