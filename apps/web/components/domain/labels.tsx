import { Badge } from "@/components/ui/badge";
import type { PlanStatus, TaskKind, TaskPriority } from "@/lib/data/types";

export const kindLabels: Record<TaskKind, string> = {
  must_do: "Must-do",
  should_do: "Should-do",
  bonus: "Bonus",
};

export const kindDescriptions: Record<TaskKind, string> = {
  must_do: "Protected by focus and required to unlock the day.",
  should_do: "Moves the day forward once the essentials are covered.",
  bonus: "Optional work that earns extra reward minutes.",
};

const kindTones = {
  must_do: "accent",
  should_do: "neutral",
  bonus: "warning",
} as const;

export function KindBadge({ kind }: { kind: TaskKind }) {
  return <Badge tone={kindTones[kind]}>{kindLabels[kind]}</Badge>;
}

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const planStatusLabels: Record<PlanStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  active: "In focus",
  completed: "Completed",
  skipped: "Skipped",
};

const planTones = {
  draft: "warning",
  confirmed: "accent",
  active: "success",
  completed: "neutral",
  skipped: "neutral",
} as const;

export function PlanStatusBadge({ status }: { status: PlanStatus }) {
  const tone = planTones[status];
  return (
    <Badge tone={tone}>
      {status === "active" ? <span className="size-1.5 rounded-full bg-success" aria-hidden /> : null}
      {planStatusLabels[status]}
    </Badge>
  );
}

export const categoryLabels: Record<string, string> = {
  work: "Work",
  study: "Study",
  health: "Health",
  personal: "Personal",
  finance: "Finance",
  other: "Other",
};
