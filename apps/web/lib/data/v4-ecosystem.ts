import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  getSupabaseContext,
  getSupabaseUserTimezone,
  localDateInTimezone,
} from "@/lib/supabase/data-client";
import type { TaskCategory, TaskKind } from "./types";
import {
  BUILT_IN_PLAN_TEMPLATES,
  type PlanTemplateItem,
} from "@/lib/domain/focus-coach";

export interface PlanTemplateRecord {
  id: string;
  name: string;
  description: string;
  items: PlanTemplateItem[];
  isSystem: boolean;
}

export interface RecurringRuleRecord {
  id: string;
  title: string;
  category: TaskCategory;
  kind: TaskKind;
  estimatedMinutes: number;
  recurrenceType: "daily" | "weekdays" | "custom";
  daysOfWeek: number[];
  active: boolean;
  lastGeneratedDate: string | null;
}

export interface StalledTaskItem {
  id: string;
  title: string;
  category: TaskCategory;
  daysOpen: number;
  planAppearances: number;
}

export interface PartnerStatusItem {
  partnershipId: string;
  partnerUserId: string;
  displayName: string;
  gateStatus: "locked" | "focusing" | "open";
  remainingTasks: number;
  completedToday: number;
  lastCheer: { message: string; createdAt: string } | null;
}

export interface WeeklyReviewRecord {
  weekStart: string;
  proudestWin: string;
  reflectionNote: string;
  triagedCount: number;
}

export async function listPlanTemplates(locale: "en" | "vi" = "en"): Promise<PlanTemplateRecord[]> {
  const systemTemplates: PlanTemplateRecord[] = BUILT_IN_PLAN_TEMPLATES.map((t) => ({
    id: t.id,
    name: locale === "vi" ? t.nameVi : t.name,
    description: locale === "vi" ? t.descriptionVi : t.description,
    items: t.items,
    isSystem: true,
  }));

  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("plan_templates")
        .select("id, name, description, items_json")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error || !data) return systemTemplates;
      const custom = data.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        description: String(row.description ?? ""),
        items: Array.isArray(row.items_json) ? (row.items_json as PlanTemplateItem[]) : [],
        isSystem: false,
      }));
      return [...custom, ...systemTemplates];
    } catch {
      return systemTemplates;
    }
  }

  return withUser(async (db) => {
    try {
      const res = await db.query<{
        id: string;
        name: string;
        description: string;
        items_json: PlanTemplateItem[];
      }>(
        `select id, name, description, items_json
         from public.plan_templates
         where user_id = $1
         order by created_at desc
         limit 20`,
        [LOCAL_USER_ID],
      );
      const custom = res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        items: Array.isArray(row.items_json) ? row.items_json : [],
        isSystem: false,
      }));
      return [...custom, ...systemTemplates];
    } catch {
      return systemTemplates;
    }
  });
}

export async function listRecurringRules(): Promise<RecurringRuleRecord[]> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from("recurring_task_rules")
        .select("*")
        .eq("user_id", ctx.userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error || !data) return [];
      return data.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        category: (r.category as TaskCategory) ?? "work",
        kind: (r.kind as TaskKind) ?? "must_do",
        estimatedMinutes: Number(r.estimated_minutes ?? 30),
        recurrenceType:
          r.recurrence_type === "weekdays" || r.recurrence_type === "custom"
            ? r.recurrence_type
            : "daily",
        daysOfWeek: Array.isArray(r.days_of_week) ? (r.days_of_week as number[]) : [1, 2, 3, 4, 5],
        active: Boolean(r.active ?? true),
        lastGeneratedDate: (r.last_generated_date as string | null) ?? null,
      }));
    } catch {
      return [];
    }
  }

  return withUser(async (db) => {
    try {
      const res = await db.query<Record<string, unknown>>(
        `select * from public.recurring_task_rules
         where user_id = $1 order by created_at desc limit 30`,
        [LOCAL_USER_ID],
      );
      return res.rows.map((r) => ({
        id: String(r.id),
        title: String(r.title),
        category: (r.category as TaskCategory) ?? "work",
        kind: (r.kind as TaskKind) ?? "must_do",
        estimatedMinutes: Number(r.estimated_minutes ?? 30),
        recurrenceType:
          r.recurrence_type === "weekdays" || r.recurrence_type === "custom"
            ? r.recurrence_type
            : "daily",
        daysOfWeek: Array.isArray(r.days_of_week) ? (r.days_of_week as number[]) : [1, 2, 3, 4, 5],
        active: Boolean(r.active ?? true),
        lastGeneratedDate: (r.last_generated_date as string | null) ?? null,
      }));
    } catch {
      return [];
    }
  });
}

export async function createRecurringRule(input: {
  title: string;
  category: TaskCategory;
  kind: TaskKind;
  estimatedMinutes: number;
  recurrenceType: "daily" | "weekdays" | "custom";
  daysOfWeek: number[];
}): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase.from("recurring_task_rules").insert({
      user_id: ctx.userId,
      title: input.title.trim(),
      category: input.category,
      kind: input.kind,
      estimated_minutes: Math.max(5, Math.min(240, input.estimatedMinutes)),
      recurrence_type: input.recurrenceType,
      days_of_week: input.daysOfWeek,
      active: true,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `insert into public.recurring_task_rules
       (user_id, title, category, kind, estimated_minutes, recurrence_type, days_of_week, active)
       values ($1, $2, $3, $4, $5, $6, $7, true)`,
      [
        LOCAL_USER_ID,
        input.title.trim(),
        input.category,
        input.kind,
        Math.max(5, Math.min(240, input.estimatedMinutes)),
        input.recurrenceType,
        input.daysOfWeek,
      ],
    );
  });
}

export async function deleteRecurringRule(ruleId: string): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    const { error } = await ctx.supabase
      .from("recurring_task_rules")
      .delete()
      .eq("id", ruleId)
      .eq("user_id", ctx.userId);
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(
      `delete from public.recurring_task_rules where id = $1 and user_id = $2`,
      [ruleId, LOCAL_USER_ID],
    );
  });
}

export async function getStalledTasks(): Promise<StalledTaskItem[]> {
  const cutoffMs = Date.now() - 4 * 86_400_000;
  const ctx = await getSupabaseContext();
  if (ctx) {
    try {
      const { data: tasks } = await ctx.supabase
        .from("tasks")
        .select("id, title, category, created_at")
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress"])
        .order("created_at", { ascending: true })
        .limit(40);

      const { data: planLinks } = await ctx.supabase
        .from("daily_plan_tasks")
        .select("task_id")
        .eq("user_id", ctx.userId);

      const countByTask = new Map<string, number>();
      for (const link of planLinks ?? []) {
        const tid = String(link.task_id);
        countByTask.set(tid, (countByTask.get(tid) ?? 0) + 1);
      }

      const result: StalledTaskItem[] = [];
      for (const t of tasks ?? []) {
        const createdMs = new Date(String(t.created_at)).getTime();
        const daysOpen = Math.max(0, Math.floor((Date.now() - createdMs) / 86_400_000));
        const appearances = countByTask.get(String(t.id)) ?? 0;
        if (appearances >= 2 || createdMs <= cutoffMs) {
          result.push({
            id: String(t.id),
            title: String(t.title),
            category: (t.category as TaskCategory) ?? "work",
            daysOpen,
            planAppearances: appearances,
          });
        }
      }
      return result.slice(0, 5);
    } catch {
      return [];
    }
  }

  return withUser(async (db) => {
    const res = await db.query<{
      id: string;
      title: string;
      category: TaskCategory;
      days_open: number;
      plan_appearances: number;
    }>(
      `select t.id, t.title, t.category,
              greatest(0, extract(day from (now() - t.created_at))::int) as days_open,
              coalesce((select count(*)::int from public.daily_plan_tasks pt where pt.task_id = t.id), 0) as plan_appearances
       from public.tasks t
       where t.user_id = $1 and t.status in ('todo', 'in_progress')
       order by plan_appearances desc, t.created_at asc
       limit 20`,
      [LOCAL_USER_ID],
    );
    return res.rows
      .filter((r) => r.plan_appearances >= 2 || r.days_open >= 4)
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        daysOpen: r.days_open,
        planAppearances: r.plan_appearances,
      }));
  });
}

export async function getWeeklyReviewContext(): Promise<{
  weekStart: string;
  latestReview: WeeklyReviewRecord | null;
  completedThisWeek: Array<{ id: string; title: string }>;
  staleBacklog: Array<{ id: string; title: string; daysOpen: number }>;
}> {
  const ctx = await getSupabaseContext();
  const timezone = ctx ? await getSupabaseUserTimezone(ctx.supabase, ctx.userId) : "UTC";
  const todayStr = localDateInTimezone(timezone);
  const nowDate = new Date(`${todayStr}T12:00:00Z`);
  const dayOfWeek = (nowDate.getUTCDay() + 6) % 7; // Monday = 0
  const weekStartDate = new Date(nowDate.getTime() - dayOfWeek * 86_400_000);
  const weekStart = weekStartDate.toISOString().slice(0, 10);
  const cutoffIso = new Date(weekStartDate.getTime() - 86_400_000).toISOString();

  if (ctx) {
    const [reviewRes, completedRes, openRes] = await Promise.all([
      ctx.supabase
        .from("weekly_reviews")
        .select("week_start, proudest_win, reflection_note, triaged_count")
        .eq("user_id", ctx.userId)
        .eq("week_start", weekStart)
        .maybeSingle(),
      ctx.supabase
        .from("tasks")
        .select("id, title")
        .eq("user_id", ctx.userId)
        .eq("status", "completed")
        .gte("completed_at", cutoffIso)
        .order("completed_at", { ascending: false })
        .limit(15),
      ctx.supabase
        .from("tasks")
        .select("id, title, created_at")
        .eq("user_id", ctx.userId)
        .in("status", ["todo", "in_progress"])
        .order("created_at", { ascending: true })
        .limit(12),
    ]);

    return {
      weekStart,
      latestReview: reviewRes.data
        ? {
            weekStart: String(reviewRes.data.week_start),
            proudestWin: String(reviewRes.data.proudest_win ?? ""),
            reflectionNote: String(reviewRes.data.reflection_note ?? ""),
            triagedCount: Number(reviewRes.data.triaged_count ?? 0),
          }
        : null,
      completedThisWeek: (completedRes.data ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title),
      })),
      staleBacklog: (openRes.data ?? []).map((r) => ({
        id: String(r.id),
        title: String(r.title),
        daysOpen: Math.max(
          0,
          Math.floor((Date.now() - new Date(String(r.created_at)).getTime()) / 86_400_000),
        ),
      })),
    };
  }

  return withUser(async (db) => {
    const [reviewRes, completedRes, openRes] = await Promise.all([
      db
        .query<{
          week_start: string;
          proudest_win: string;
          reflection_note: string;
          triaged_count: number;
        }>(
          `select week_start::text, proudest_win, reflection_note, triaged_count
           from public.weekly_reviews where user_id = $1 and week_start = $2::date limit 1`,
          [LOCAL_USER_ID, weekStart],
        )
        .catch(() => ({ rows: [] })),
      db.query<{ id: string; title: string }>(
        `select id, title from public.tasks
         where user_id = $1 and status = 'completed' and completed_at >= $2::timestamptz
         order by completed_at desc limit 15`,
        [LOCAL_USER_ID, cutoffIso],
      ),
      db.query<{ id: string; title: string; days_open: number }>(
        `select id, title, greatest(0, extract(day from (now() - created_at))::int) as days_open
         from public.tasks where user_id = $1 and status in ('todo', 'in_progress')
         order by created_at asc limit 12`,
        [LOCAL_USER_ID],
      ),
    ]);

    const rev = reviewRes.rows[0];
    return {
      weekStart,
      latestReview: rev
        ? {
            weekStart: rev.week_start,
            proudestWin: rev.proudest_win,
            reflectionNote: rev.reflection_note,
            triagedCount: rev.triaged_count,
          }
        : null,
      completedThisWeek: completedRes.rows,
      staleBacklog: openRes.rows.map((r) => ({
        id: r.id,
        title: r.title,
        daysOpen: r.days_open,
      })),
    };
  });
}

export async function saveWeeklyReview(input: {
  weekStart: string;
  proudestWin: string;
  reflectionNote: string;
  archiveTaskIds: string[];
}): Promise<void> {
  const ctx = await getSupabaseContext();
  if (ctx) {
    if (input.archiveTaskIds.length > 0) {
      await ctx.supabase
        .from("tasks")
        .update({ status: "archived" })
        .eq("user_id", ctx.userId)
        .in("id", input.archiveTaskIds);
    }
    const { error } = await ctx.supabase.from("weekly_reviews").upsert(
      {
        user_id: ctx.userId,
        week_start: input.weekStart,
        proudest_win: input.proudestWin.trim().slice(0, 240),
        reflection_note: input.reflectionNote.trim().slice(0, 600),
        triaged_count: input.archiveTaskIds.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,week_start" },
    );
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    if (input.archiveTaskIds.length > 0) {
      await db.query(
        `update public.tasks set status = 'archived'
         where user_id = $1 and id = any($2::uuid[])`,
        [LOCAL_USER_ID, input.archiveTaskIds],
      );
    }
    await db.query(
      `insert into public.weekly_reviews (user_id, week_start, proudest_win, reflection_note, triaged_count)
       values ($1, $2::date, $3, $4, $5)
       on conflict (user_id, week_start)
       do update set proudest_win = excluded.proudest_win,
                     reflection_note = excluded.reflection_note,
                     triaged_count = excluded.triaged_count,
                     updated_at = now()`,
      [
        LOCAL_USER_ID,
        input.weekStart,
        input.proudestWin.trim().slice(0, 240),
        input.reflectionNote.trim().slice(0, 600),
        input.archiveTaskIds.length,
      ],
    );
  });
}

export async function getPartnerOverview(request?: Request): Promise<{
  pendingInviteCode: string | null;
  partners: PartnerStatusItem[];
}> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    try {
      const [inviteRes, statusRes] = await Promise.all([
        ctx.supabase
          .from("accountability_partners")
          .select("invite_code")
          .eq("user_id", ctx.userId)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        ctx.supabase.rpc("rpc_get_partner_statuses"),
      ]);
      const partners = Array.isArray(statusRes.data)
        ? (statusRes.data as PartnerStatusItem[])
        : [];
      return {
        pendingInviteCode: (inviteRes.data?.invite_code as string | null) ?? null,
        partners,
      };
    } catch {
      return { pendingInviteCode: null, partners: [] };
    }
  }

  return withUser(async (db) => {
    try {
      const inv = await db.query<{ invite_code: string }>(
        `select invite_code from public.accountability_partners
         where user_id = $1 and status = 'pending' order by created_at desc limit 1`,
        [LOCAL_USER_ID],
      );
      const st = await db.query<{ result: PartnerStatusItem[] }>(
        `select public.rpc_get_partner_statuses() as result`,
      );
      return {
        pendingInviteCode: inv.rows[0]?.invite_code ?? null,
        partners: Array.isArray(st.rows[0]?.result) ? st.rows[0].result : [],
      };
    } catch {
      return { pendingInviteCode: null, partners: [] };
    }
  });
}

export async function createPartnerInvite(request?: Request): Promise<string> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { data, error } = await ctx.supabase.rpc("rpc_create_partner_invite");
    if (error) throw new Error(error.message);
    return String((data as { invite_code?: string })?.invite_code ?? "");
  }

  return withUser(async (db) => {
    const res = await db.query<{ result: { invite_code: string } }>(
      `select public.rpc_create_partner_invite() as result`,
    );
    return res.rows[0]?.result?.invite_code ?? "";
  });
}

export async function acceptPartnerInvite(code: string, request?: Request): Promise<void> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { error } = await ctx.supabase.rpc("rpc_accept_partner_invite", { p_code: code });
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(`select public.rpc_accept_partner_invite($1)`, [code]);
  });
}

export async function sendPartnerCheer(
  partnerUserId: string,
  message: string,
  request?: Request,
): Promise<void> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const { error } = await ctx.supabase.rpc("rpc_send_partner_cheer", {
      p_partner_user_id: partnerUserId,
      p_message: message,
    });
    if (error) throw new Error(error.message);
    return;
  }

  await withUser(async (db) => {
    await db.query(`select public.rpc_send_partner_cheer($1::uuid, $2)`, [
      partnerUserId,
      message,
    ]);
  });
}
