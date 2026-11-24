import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import {
  assertSupabaseOk,
  getSupabaseContext,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { getAgentTodayPlan, type AgentPlanSnapshot } from "./agent-plan";

/**
 * Ensure today's daily plan exists, populate recurring habits, and seed any
 * remaining open `must_do` tasks that are not already in the plan.
 */
export async function buildAgentTodayPlan(request?: Request): Promise<AgentPlanSnapshot> {
  const ctx = await getSupabaseContext(request);
  if (ctx) {
    const created = unwrapSupabase(
      await ctx.supabase.rpc("rpc_create_daily_plan", { p_plan_date: null }),
      "Could not create today's daily plan.",
    ) as { planId?: string };
    const planId = created.planId;
    if (!planId) {
      throw new Error("Could not create today's daily plan.");
    }

    assertSupabaseOk(
      await ctx.supabase.rpc("rpc_populate_today_habits", { p_plan_id: planId }),
    );

    const [existingPlanTasks, openMustDos] = await Promise.all([
      ctx.supabase
        .from("daily_plan_tasks")
        .select("task_id")
        .eq("plan_id", planId),
      ctx.supabase
        .from("tasks")
        .select("id")
        .eq("user_id", ctx.userId)
        .eq("kind", "must_do")
        .in("status", ["todo", "in_progress"])
        .order("created_at", { ascending: true })
        .limit(20),
    ]);

    if (existingPlanTasks.error) throw new Error(existingPlanTasks.error.message);
    if (openMustDos.error) throw new Error(openMustDos.error.message);

    const existingIds = new Set(
      (existingPlanTasks.data as Array<{ task_id: string }> | null ?? []).map(
        (row) => row.task_id,
      ),
    );

    for (const task of (openMustDos.data as Array<{ id: string }> | null) ?? []) {
      if (existingIds.has(task.id)) continue;
      assertSupabaseOk(
        await ctx.supabase.rpc("rpc_add_plan_task", {
          p_plan_id: planId,
          p_task_id: task.id,
          p_kind: "must_do",
          p_planned_start: null,
          p_planned_minutes: null,
        }),
      );
      existingIds.add(task.id);
    }

    return getAgentTodayPlan(request);
  }

  await withUser(async (db) => {
    const planRes = await db.query<{ result: { planId?: string } }>(
      "select public.rpc_create_daily_plan(null) as result",
    );
    const planId = planRes.rows[0]?.result?.planId;
    if (!planId) {
      throw new Error("Could not create today's daily plan.");
    }

    await db.query("select public.rpc_populate_today_habits($1)", [planId]);

    const openRes = await db.query<{ id: string }>(
      `select t.id
       from public.tasks t
       where t.user_id = $1
         and t.kind = 'must_do'
         and t.status in ('todo', 'in_progress')
         and not exists (
           select 1 from public.daily_plan_tasks pt
           where pt.plan_id = $2 and pt.task_id = t.id
         )
       order by t.created_at asc
       limit 20`,
      [LOCAL_USER_ID, planId],
    );

    for (const row of openRes.rows) {
      await db.query(
        "select public.rpc_add_plan_task($1, $2, 'must_do'::public.task_kind, null, null)",
        [planId, row.id],
      );
    }
  });

  return getAgentTodayPlan(request);
}
