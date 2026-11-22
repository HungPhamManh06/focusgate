import { z } from "zod";

export const taskKinds = ["must_do", "should_do", "bonus"] as const;
export const taskPriorities = ["low", "medium", "high", "urgent"] as const;
export const taskCategories = ["work", "study", "health", "personal", "finance", "other"] as const;
export const focusModes = ["pomodoro_25_5", "pomodoro_50_10", "custom"] as const;
export const devicePlatforms = ["windows", "android", "web"] as const;

export const deviceRegisterSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the device a name.")
    .max(80, "Keep the device name under 80 characters."),
  platform: z.enum(devicePlatforms),
});

export const deviceRenameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the device a name.")
    .max(80, "Keep the device name under 80 characters."),
});

export const taskFormSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title.").max(160, "Keep the title under 160 characters."),
    description: z.string().trim().max(2000, "Keep the description under 2000 characters."),
    category: z.enum(taskCategories),
    kind: z.enum(taskKinds),
    priority: z.enum(taskPriorities),
    estimatedMinutes: z.coerce.number().int().min(5, "Estimate at least 5 minutes.").max(480),
    requiredFocusMinutes: z.coerce.number().int().min(0).max(480),
    dueDate: z.string().trim().optional(),
  })
  .refine((data) => data.requiredFocusMinutes <= data.estimatedMinutes, {
    message: "Required focus minutes cannot exceed the estimated duration.",
    path: ["requiredFocusMinutes"],
  });

export type TaskFormValues = z.infer<typeof taskFormSchema>;

export const focusStartSchema = z.object({
  taskId: z.string().uuid().nullable().optional(),
  mode: z.enum(focusModes),
  minutes: z.coerce.number().int().min(5, "A session needs at least 5 minutes.").max(180),
});

export function getMinAllowedPlannedMinutes(minValidFocusMinutes: number): number {
  const safeMinValid = Math.max(1, Math.round(minValidFocusMinutes));
  return Math.max(5, Math.ceil(safeMinValid / 2));
}

export function validatePlannedDurationAgainstMinValid(input: {
  plannedMinutes: number;
  minValidFocusMinutes: number;
}): { valid: true } | { valid: false; error: string; minPlannedMinutes: number } {
  const safeMinValid = Math.max(1, Math.round(input.minValidFocusMinutes));
  const minPlannedMinutes = getMinAllowedPlannedMinutes(safeMinValid);
  if (input.plannedMinutes * 2 < safeMinValid) {
    return {
      valid: false,
      minPlannedMinutes,
      error: `A ${input.plannedMinutes}m block caps credit at ${input.plannedMinutes * 2}m, which is below your ${safeMinValid}m minimum valid duration. Choose at least ${minPlannedMinutes} minutes.`,
    };
  }
  return { valid: true };
}

export const spendSchema = z.object({
  grantId: z.string().uuid("Choose an active grant."),
  minutes: z.coerce.number().int().min(1, "Spend at least 1 minute.").max(600),
  label: z
    .string()
    .trim()
    .min(1, "What did you use the time on?")
    .max(120, "Keep the label under 120 characters."),
});

export function dateInputToIso(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function isoToDateInput(value: string | null): string {
  if (!value) return "";
  return value.slice(0, 10);
}
