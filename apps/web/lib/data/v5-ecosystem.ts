import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import { getSupabaseContext } from "@/lib/supabase/data-client";
import {
  FOCUS_QUEST_CATALOG,
  type GateThemeId,
} from "@/lib/domain/gate-themes";
import {
  parseIcsEventsForDate,
  type CalendarBusyEvent,
} from "@/lib/domain/ics-parser";

export interface FocusQuestRecord {
  id: string;
  questKey: string;
  title: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  status: "active" | "completed" | "abandoned";
}

export async function listFocusQuests(): Promise<FocusQuestRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("focus_quests")
        .select("*")
        .eq("user_id", ctx.userId)
        .neq("status", "abandoned")
        .order("started_at", { ascending: false })
        .limit(10);
      if (error || !data) return [];
      return data.map((r) => ({
        id: String(r.id),
        questKey: String(r.quest_key),
        title: String(r.title),
        targetValue: Number(r.target_value ?? 7),
        currentValue: Number(r.current_value ?? 0),
        unit: String(r.unit ?? "days"),
        status: r.status === "completed" ? "completed" : "active",
      }));
    } catch {
      return [];
    }
  }

  return withUser(async (db) => {
    try {
      const res = await db.query<Record<string, unknown>>(
        `select * from public.focus_quests
         where user_id = $1 and status <> 'abandoned'
         order by started_at desc limit 10`,
        [LOCAL_USER_ID],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        questKey: String(r.quest_key),
        title: String(r.title),
        targetValue: Number(r.target_value ?? 7),
        currentValue: Number(r.current_value ?? 0),
        unit: String(r.unit ?? "days"),
        status: r.status === "completed" ? "completed" : "active",
      }));
    } catch {
      return [];
    }
  });
}

export async function joinFocusQuest(
  questKey: "bedtime_7d" | "deep_work_10h" | "consistency_21d",
  locale: "en" | "vi" = "vi",
): Promise<void> {
  const tpl = FOCUS_QUEST_CATALOG.find((q) => q.key === questKey);
  if (!tpl) throw new Error("Unknown quest");
  const title = locale === "vi" ? tpl.titleVi : tpl.titleEn;
  const unit = locale === "vi" ? tpl.unitVi : tpl.unitEn;

  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase.from("focus_quests").insert({
      user_id: ctx.userId,
      quest_key: tpl.key,
      title,
      target_value: tpl.targetValue,
      current_value: 0,
      unit,
      status: "active",
    });
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `insert into public.focus_quests (user_id, quest_key, title, target_value, current_value, unit, status)
       values ($1, $2, $3, $4, 0, $5, 'active')`,
      [LOCAL_USER_ID, tpl.key, title, tpl.targetValue, unit],
    );
  });
}

export async function updateV5Settings(input: {
  calendarIcsUrl?: string | null;
  calendarAutoLock?: boolean;
  telegramChatId?: string | null;
  discordWebhookUrl?: string | null;
  gateTheme?: GateThemeId;
  onboardingCompleted?: boolean;
}): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase.rpc("rpc_update_v5_settings", {
      p_calendar_ics_url: input.calendarIcsUrl ?? null,
      p_clear_calendar_ics_url: input.calendarIcsUrl === "",
      p_calendar_auto_lock: input.calendarAutoLock ?? null,
      p_telegram_chat_id: input.telegramChatId ?? null,
      p_discord_webhook_url: input.discordWebhookUrl ?? null,
      p_clear_discord_webhook: input.discordWebhookUrl === "",
      p_gate_theme: input.gateTheme ?? null,
      p_onboarding_completed: input.onboardingCompleted ?? null,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `insert into public.user_settings (user_id) values ($1) on conflict (user_id) do nothing`,
      [LOCAL_USER_ID],
    );
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (input.calendarIcsUrl !== undefined) {
      sets.push(`calendar_ics_url = $${i++}`);
      vals.push(input.calendarIcsUrl?.trim() || null);
    }
    if (input.calendarAutoLock !== undefined) {
      sets.push(`calendar_auto_lock = $${i++}`);
      vals.push(input.calendarAutoLock);
    }
    if (input.telegramChatId !== undefined) {
      sets.push(`telegram_chat_id = $${i++}`);
      vals.push(input.telegramChatId?.trim() || null);
    }
    if (input.discordWebhookUrl !== undefined) {
      sets.push(`discord_webhook_url = $${i++}`);
      vals.push(input.discordWebhookUrl?.trim() || null);
    }
    if (input.gateTheme !== undefined) {
      sets.push(`gate_theme = $${i++}`);
      vals.push(input.gateTheme);
    }
    if (input.onboardingCompleted !== undefined) {
      sets.push(`onboarding_completed = $${i++}`);
      vals.push(input.onboardingCompleted);
    }
    if (sets.length === 0) return;
    vals.push(LOCAL_USER_ID);
    await db.query(
      `update public.user_settings set ${sets.join(", ")}, updated_at = now() where user_id = $${i}`,
      vals,
    );
  });
}

export async function fetchTodayCalendarEvents(
  icsUrl: string | null | undefined,
  todayYmd: string,
): Promise<CalendarBusyEvent[]> {
  if (!icsUrl || !/^https?:\/\//i.test(icsUrl.trim())) return [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(icsUrl.trim(), {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const text = await res.text();
    return parseIcsEventsForDate(text, todayYmd);
  } catch {
    return [];
  }
}
