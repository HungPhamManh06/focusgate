import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { getSupabaseContext } from "@/lib/supabase/data-client";

export type DeviceCommandPlatform = "windows" | "android" | "any";

export interface DeviceCommandRecord {
  id: string;
  targetPlatform: DeviceCommandPlatform;
  commandType: string;
  payload: Record<string, unknown>;
  status: "pending" | "executed" | "failed" | "expired";
  createdAt: string;
  expiresAt: string;
}

export async function enqueueDeviceCommand(
  input: {
    targetPlatform: DeviceCommandPlatform;
    commandType: string;
    payload: Record<string, unknown>;
  },
  request?: Request,
): Promise<DeviceCommandRecord | null> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("device_commands")
        .insert({
          user_id: ctx.userId,
          target_platform: input.targetPlatform,
          command_type: input.commandType,
          payload: input.payload,
          status: "pending",
        })
        .select("id, target_platform, command_type, payload, status, created_at, expires_at")
        .single();
      if (error || !data) return null;
      return {
        id: String(data.id),
        targetPlatform: data.target_platform as DeviceCommandPlatform,
        commandType: String(data.command_type),
        payload: (data.payload as Record<string, unknown>) ?? {},
        status: data.status as DeviceCommandRecord["status"],
        createdAt: String(data.created_at),
        expiresAt: String(data.expires_at),
      };
    } catch {
      return null;
    }
  }

  try {
    return await withUser(async (db) => {
      const res = await db.query<{
        id: string;
        target_platform: DeviceCommandPlatform;
        command_type: string;
        payload: Record<string, unknown>;
        status: DeviceCommandRecord["status"];
        created_at: string | Date;
        expires_at: string | Date;
      }>(
        `insert into public.device_commands (user_id, target_platform, command_type, payload, status)
         values ($1, $2, $3, $4::jsonb, 'pending')
         returning id, target_platform, command_type, payload, status, created_at, expires_at`,
        [LOCAL_USER_ID, input.targetPlatform, input.commandType, JSON.stringify(input.payload)],
      );
      const row = res.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        targetPlatform: row.target_platform,
        commandType: row.command_type,
        payload: row.payload ?? {},
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    });
  } catch {
    return null;
  }
}

export async function pollPendingDeviceCommands(
  platform: "windows" | "android",
  request?: Request,
): Promise<DeviceCommandRecord[]> {
  const nowIso = new Date().toISOString();
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("device_commands")
        .select("id, target_platform, command_type, payload, status, created_at, expires_at")
        .eq("user_id", ctx.userId)
        .in("target_platform", [platform, "any"])
        .eq("status", "pending")
        .gt("expires_at", nowIso)
        .order("created_at", { ascending: true })
        .limit(10);
      if (error || !data) return [];
      return data.map((row) => ({
        id: String(row.id),
        targetPlatform: row.target_platform as DeviceCommandPlatform,
        commandType: String(row.command_type),
        payload: (row.payload as Record<string, unknown>) ?? {},
        status: row.status as DeviceCommandRecord["status"],
        createdAt: String(row.created_at),
        expiresAt: String(row.expires_at),
      }));
    } catch {
      return [];
    }
  }

  try {
    return await withUser(async (db) => {
      const res = await db.query<{
        id: string;
        target_platform: DeviceCommandPlatform;
        command_type: string;
        payload: Record<string, unknown>;
        status: DeviceCommandRecord["status"];
        created_at: string | Date;
        expires_at: string | Date;
      }>(
        `select id, target_platform, command_type, payload, status, created_at, expires_at
         from public.device_commands
         where user_id = $1
           and target_platform in ($2, 'any')
           and status = 'pending'
           and expires_at > now()
         order by created_at asc
         limit 10`,
        [LOCAL_USER_ID, platform],
      );
      return res.rows.map((row) => ({
        id: row.id,
        targetPlatform: row.target_platform,
        commandType: row.command_type,
        payload: row.payload ?? {},
        status: row.status,
        createdAt: new Date(row.created_at).toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      }));
    });
  } catch {
    return [];
  }
}

export async function ackDeviceCommand(
  input: {
    commandId: string;
    status: "executed" | "failed";
    resultMessage?: string | null;
  },
  request?: Request,
): Promise<boolean> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    try {
      const { error } = await ctx.supabase
        .from("device_commands")
        .update({
          status: input.status,
          result_message: input.resultMessage ?? null,
          executed_at: new Date().toISOString(),
        })
        .eq("id", input.commandId)
        .eq("user_id", ctx.userId);
      return !error;
    } catch {
      return false;
    }
  }

  try {
    await withUser(async (db) => {
      await db.query(
        `update public.device_commands
         set status = $1, result_message = $2, executed_at = now()
         where id = $3 and user_id = $4`,
        [input.status, input.resultMessage ?? null, input.commandId, LOCAL_USER_ID],
      );
    });
    return true;
  } catch {
    return false;
  }
}
