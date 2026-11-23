import { Badge } from "@/components/ui/badge";
import type { PlanStatus, TaskKind, TaskPriority } from "@/lib/data/types";

export const kindLabels: Record<TaskKind, string> = {
  must_do: "Must-do",
  should_do: "Should-do",
  bonus: "Bonus",
};

export const kindLabelsVi: Record<TaskKind, string> = {
  must_do: "Bắt buộc",
  should_do: "Nên làm",
  bonus: "Thưởng thêm",
};

export function getKindLabel(kind: TaskKind, locale: "en" | "vi" = "en"): string {
  return locale === "vi" ? kindLabelsVi[kind] : kindLabels[kind];
}

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

export function KindBadge({
  kind,
  locale = "en",
}: {
  kind: TaskKind;
  locale?: "en" | "vi";
}) {
  return <Badge tone={kindTones[kind]}>{getKindLabel(kind, locale)}</Badge>;
}

export const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const priorityLabelsVi: Record<TaskPriority, string> = {
  low: "Thấp",
  medium: "Trung bình",
  high: "Cao",
  urgent: "Khẩn cấp",
};

export function getPriorityLabel(priority: TaskPriority, locale: "en" | "vi" = "en"): string {
  return locale === "vi" ? priorityLabelsVi[priority] : priorityLabels[priority];
}

export const planStatusLabels: Record<PlanStatus, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  active: "In focus",
  completed: "Completed",
  skipped: "Skipped",
};

export const planStatusLabelsVi: Record<PlanStatus, string> = {
  draft: "Bản nháp",
  confirmed: "Đã chốt",
  active: "Đang tập trung",
  completed: "Hoàn thành",
  skipped: "Đã bỏ qua",
};

const planTones = {
  draft: "warning",
  confirmed: "accent",
  active: "success",
  completed: "neutral",
  skipped: "neutral",
} as const;

export function PlanStatusBadge({
  status,
  locale = "en",
}: {
  status: PlanStatus;
  locale?: "en" | "vi";
}) {
  const tone = planTones[status];
  return (
    <Badge tone={tone}>
      {status === "active" ? <span className="size-1.5 rounded-full bg-success" aria-hidden /> : null}
      {locale === "vi" ? planStatusLabelsVi[status] : planStatusLabels[status]}
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

export const categoryLabelsVi: Record<string, string> = {
  work: "Công việc",
  study: "Học tập",
  health: "Sức khỏe",
  personal: "Cá nhân",
  finance: "Tài chính",
  other: "Khác",
};

export function getCategoryLabel(category: string, locale: "en" | "vi" = "en"): string {
  return locale === "vi"
    ? categoryLabelsVi[category] ?? category
    : categoryLabels[category] ?? category;
}
