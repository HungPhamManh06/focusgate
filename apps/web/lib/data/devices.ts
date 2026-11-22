import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
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
