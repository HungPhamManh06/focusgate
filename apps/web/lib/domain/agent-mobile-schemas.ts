import { z } from "zod";

const mobileTaskKinds = ["must_do", "should_do", "bonus"] as const;

export const agentCreateTaskSchema = z.object({
  title: z.string().trim().min(1, "Task title is required.").max(140),
  kind: z.enum(mobileTaskKinds).default("must_do"),
  requiredFocusMinutes: z.number().int().min(0).max(240).default(0),
  estimatedMinutes: z.number().int().min(1).max(480).optional(),
  addToTodayPlan: z.boolean().default(true),
});

export const agentPlanLifecycleSchema = z.object({
  action: z.enum(["confirm_and_activate", "complete_and_claim"]),
  deviceId: z.string().uuid().optional().nullable(),
});

export type AgentCreateTaskInput = z.infer<typeof agentCreateTaskSchema>;
export type AgentPlanLifecycleInput = z.infer<typeof agentPlanLifecycleSchema>;
