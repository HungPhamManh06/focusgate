import "server-only";

import { LOCAL_USER_ID, withUser } from "@/lib/db";
import type {
  AgentCreateTaskInput,
  AgentPlanLifecycleInput,
} from "@/lib/domain/agent-mobile-schemas";
import {
  assertSupabaseOk,
  getSupabaseContext,
  unwrapSupabase,
} from "@/lib/supabase/data-client";
import { getAgentTodayPlan, type AgentPlanSnapshot } from "./agent-plan";

export interface AgentCreateTaskResult {
  taskId: string;
  addedToPlan: boolean;
  snapshot: AgentPlanSnapshot;
}

export interface AgentPlanLifecycleResult {
  grantedMinutes: number;
  snapshot: AgentPlanSnapshot;
}

export async function createAgentTask(
  input: AgentCreateTaskInput,
  request?: Request,
): Promise<AgentCreateTaskResult> {
  const estimatedMinutes = Math.max(
    input.estimatedMinutes ?? Math.max(input.requiredFocusMinutes, 15),
    input.requiredFocusMinutes,
    1,
  );
  const ctx = await getSupabaseContext(request);

  if (ctx) {
    const row = unwrapSupabase(
      await ctx.supabase
        .from("tasks")
        .insert({
          user_id: ctx.userId,
          title: input.title,
          description: null,
          category: "other",
          kind: input.kind,
          priority: "medium",
          estimated_minutes: estimatedMinutes,
          required_focus_minutes: input.requiredFocusMinutes,
          due_date: null,
          is_daily_habit: false,
        })
        .select("id")
        .single(),
      "Task was not created.",
    ) as { id: string };

    let addedToPlan = false;
    if (input.addToTodayPlan) {
      try {
        const created = unwrapSupabase(
          await ctx.supabase.rpc("rpc_create_daily_plan", { p_plan_date: null }),
          "Could not load today's plan.",
        ) as { planId?: string };
        if (created.planId) {
          assertSupabaseOk(
            await ctx.supabase.rpc("rpc_add_plan_task", {
              p_plan_id: created.planId,
              p_task_id: row.id,
              p_kind: input.kind,
              p_planned_start: null,
              p_planned_minutes: null,
            }),
          );
          addedToPlan = true;
        }
      } catch {
        // Keep the created task in backlog if today's plan is already completed/skipped.
        addedToPlan = false;
      }
    }

    const snapshot = await getAgentTodayPlan(request);
    return { taskId: row.id, addedToPlan, snapshot };
  }

  let taskId = "";
  let addedToPlan = false;

  await withUser(async (db) => {
    const inserted = await db.query<{ id: string }>(
      `insert into public.tasks
        (user_id, title, description, category, kind, priority,
         estimated_minutes, required_focus_minutes, due_date, is_daily_habit)
       values ($1, $2, null, 'other'::public.task_category, $3::public.task_kind,
               'medium'::public.task_priority, $4, $5, null, false)
       returning id`,
      [LOCAL_USER_ID, input.title, input.kind, estimatedMinutes, input.requiredFocusMinutes],
    );
    taskId = inserted.rows[0]?.id ?? "";
    if (!taskId) throw new Error("Task was not created.");

    if (input.addToTodayPlan) {
      try {
        const planRes = await db.query<{ result: { planId?: string } }>(
          "select public.rpc_create_daily_plan(null) as result",
        );
        const planId = planRes.rows[0]?.result?.planId;
        if (planId) {
          await db.query(
            "select public.rpc_add_plan_task($1, $2, $3::public.task_kind, null, null)",
            [planId, taskId, input.kind],
          );
          addedToPlan = true;
        }
      } catch {
        addedToPlan = false;
      }
    }
  });

  const snapshot = await getAgentTodayPlan(request);
  return { taskId, addedToPlan, snapshot };
}

export async function runAgentPlanLifecycle(
  input: AgentPlanLifecycleInput,
  request?: Request,
): Promise<AgentPlanLifecycleResult> {
  const before = await getAgentTodayPlan(request);
  const plan = before.plan;
  if (!plan) {
    throw new Error("No daily plan found for today.");
  }

  const ctx = await getSupabaseContext(request);
  let grantedMinutes = 0;

  if (ctx) {
    if (input.action === "confirm_and_activate") {
      if (plan.status === "draft") {
        assertSupabaseOk(await ctx.supabase.rpc("rpc_confirm_plan", { p_plan_id: plan.id }));
        assertSupabaseOk(await ctx.supabase.rpc("rpc_activate_plan", { p_plan_id: plan.id }));
      } else if (plan.status === "confirmed") {
        assertSupabaseOk(await ctx.supabase.rpc("rpc_activate_plan", { p_plan_id: plan.id }));
      }
    } else {
      if (plan.status === "active") {
        assertSupabaseOk(await ctx.supabase.rpc("rpc_complete_plan", { p_plan_id: plan.id }));
      }
      let deviceId = input.deviceId ?? null;
      if (!deviceId) {
        const { data: dev } = await ctx.supabase
          .from("devices")
          .select("id")
          .eq("user_id", ctx.userId)
          .eq("status", "active")
          .order("last_seen_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        deviceId = (dev as { id?: string } | null)?.id ?? null;
      }
      if (deviceId) {
        const evalRes = await ctx.supabase.rpc("rpc_evaluate_unlock", {
          p_plan_id: plan.id,
          p_device_id: deviceId,
          p_idempotency_key: `mobile-eval-${plan.id}`,
        });
        if (!evalRes.error && evalRes.data && typeof evalRes.data === "object") {
          const payload = evalRes.data as { grantedMinutes?: number };
          grantedMinutes = Number(payload.grantedMinutes ?? 0);
        }
      }
    }

    const snapshot = await getAgentTodayPlan(request);
    return { grantedMinutes, snapshot };
  }

  await withUser(async (db) => {
    if (input.action === "confirm_and_activate") {
      if (plan.status === "draft") {
        await db.query("select public.rpc_confirm_plan($1)", [plan.id]);
        await db.query("select public.rpc_activate_plan($1)", [plan.id]);
      } else if (plan.status === "confirmed") {
        await db.query("select public.rpc_activate_plan($1)", [plan.id]);
      }
    } else {
      if (plan.status === "active") {
        await db.query("select public.rpc_complete_plan($1)", [plan.id]);
      }
      let deviceId = input.deviceId ?? null;
      if (!deviceId) {
        const devRes = await db.query<{ id: string }>(
          `select id from public.devices
           where user_id = $1 and status = 'active'
           order by last_seen_at desc nulls last
           limit 1`,
          [LOCAL_USER_ID],
        );
        deviceId = devRes.rows[0]?.id ?? null;
      }
      if (deviceId) {
        try {
          const evalRes = await db.query<{ result: { grantedMinutes?: number } }>(
            "select public.rpc_evaluate_unlock($1, $2, $3) as result",
            [plan.id, deviceId, `mobile-eval-${plan.id}`],
          );
          grantedMinutes = Number(evalRes.rows[0]?.result?.grantedMinutes ?? 0);
        } catch {
          grantedMinutes = 0;
        }
      }
    }
  });

  const snapshot = await getAgentTodayPlan(request);
  return { grantedMinutes, snapshot };
}
