import Link from "next/link";
import { ArrowRight, CalendarPlus, CheckCircle2, Compass, ListPlus } from "lucide-react";
import { addSuggestedTaskToTodayPlanAction } from "@/lib/actions/planner";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPriorityLabel } from "@/components/domain/labels";
import type { NextMoveSuggestion } from "@/lib/data/dashboard";
import { formatDate, formatMinutes, relativeDue } from "@/lib/data/format";

function translateNextMoveBadge(label: string, isVi: boolean): string {
  if (!isVi) return label;
  const map: Record<string, string> = {
    "Today's plan · Must-do": "Kế hoạch hôm nay · Bắt buộc",
    "Today's plan · Should-do": "Kế hoạch hôm nay · Nên làm",
    "Today's plan · Bonus": "Kế hoạch hôm nay · Thưởng thêm",
    "Backlog · Suggested": "Hàng chờ · Gợi ý",
  };
  return map[label] ?? label;
}

function translateNextMoveReason(reason: string, isVi: boolean): string {
  if (!isVi) return reason;
  const map: Record<string, string> = {
    "Suggested because all Must-dos are clear and this Should-do is in today's plan.":
      "Gợi ý vì mọi việc Bắt buộc đã xong và việc Nên làm này nằm trong kế hoạch hôm nay.",
    "Suggested because your core commitments are complete and this Bonus task earns extra time.":
      "Gợi ý vì bạn đã hoàn thành cam kết chính và việc Thưởng thêm này giúp kiếm thêm thời gian.",
    "This task is a strong candidate for today's Must-do commitment.":
      "Nhiệm vụ này rất phù hợp để thêm vào cam kết Bắt buộc hôm nay.",
    "Unscheduled backlog task — today's plan is already locked.":
      "Nhiệm vụ chưa lên lịch trong hàng chờ — kế hoạch hôm nay đã chốt.",
    "Suggested from your backlog as the next highest-priority task.":
      "Gợi ý từ hàng chờ với mức độ ưu tiên cao tiếp theo.",
    "Suggested from your backlog because no Must-do or Should-do tasks remain open.":
      "Gợi ý từ hàng chờ vì không còn việc Bắt buộc hay Nên làm nào đang mở.",
  };
  return map[reason] ?? reason;
}

export function NextMoveCard({
  suggestion,
  hasPlan,
  totalTasksCount,
  completedTasksCount,
  timezone,
  locale = "en",
}: {
  suggestion: NextMoveSuggestion | null;
  hasPlan: boolean;
  totalTasksCount: number;
  completedTasksCount: number;
  timezone: string;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  if (!suggestion) {
    const noTasksCreatedYet = totalTasksCount === 0 && completedTasksCount === 0 && !hasPlan;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-accent" strokeWidth={1.8} />
            <CardTitle>{isVi ? "Bước tiếp theo" : "Your next move"}</CardTitle>
          </div>
          <Badge tone={noTasksCreatedYet ? "neutral" : "success"}>
            {noTasksCreatedYet
              ? isVi ? "Bắt đầu tại đây" : "Start here"
              : isVi ? "Hoàn tất" : "Clear"}
          </Badge>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface-2/60 p-4">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                noTasksCreatedYet
                  ? "bg-accent-soft text-accent"
                  : "bg-success-soft text-success"
              }`}
            >
              {noTasksCreatedYet ? (
                <ListPlus className="size-4" strokeWidth={2} />
              ) : (
                <CheckCircle2 className="size-4" strokeWidth={2} />
              )}
            </span>
            <div>
              <p className="text-[14.5px] font-semibold text-ink">
                {noTasksCreatedYet
                  ? isVi ? "Thêm nhiệm vụ đầu tiên." : "Add your first task."
                  : isVi ? "Bạn đã xử lý xong hết." : "You're all caught up."}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                {noTasksCreatedYet
                  ? isVi
                    ? "Tạo vài nhiệm vụ trong danh sách — bắt đầu với ít nhất một việc Bắt buộc — trước khi lập kế hoạch hôm nay."
                    : "Create a few tasks in your backlog—starting with at least one Must-do—before building today's plan."
                  : isVi
                    ? "Không còn nhiệm vụ tồn đọng nào cần xử lý."
                    : "No outstanding tasks need your attention."}
              </p>
              {noTasksCreatedYet ? (
                <div className="mt-3">
                  <Link
                    href="/tasks"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {isVi ? "Mở danh sách nhiệm vụ" : "Open tasks"} <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const {
    task,
    inTodayPlan,
    badgeLabel,
    badgeTone,
    ctaKind,
    planId,
    focusDone,
    focusRequired,
    reason,
  } = suggestion;
  const due = relativeDue(task.dueDate, timezone, locale);
  const overdue = due ? (due.includes("overdue") || due.includes("Quá hạn")) : false;
  const displayBadge = translateNextMoveBadge(badgeLabel, isVi);
  const displayReason = translateNextMoveReason(reason, isVi);

  return (
    <Card>
      <CardHeader>
        <div>
          <p className="label-xs text-muted">{isVi ? "Bước tiếp theo" : "Your next move"}</p>
          <CardTitle className="mt-1.5">
            {inTodayPlan
              ? isVi ? "Nhiệm vụ ưu tiên đã cam kết" : "Committed priority task"
              : isVi ? "Gợi ý từ hàng chờ" : "Suggested from backlog"}
          </CardTitle>
        </div>
        <Badge tone={badgeTone}>{displayBadge}</Badge>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
          <p className="label-xs text-muted">
            {displayBadge}
          </p>
          <h3 className="mt-1.5 text-[15.5px] font-semibold leading-snug text-ink">
            {task.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-soft tabular-nums">
            <span className="font-medium">
              {isVi
                ? `Ưu tiên ${getPriorityLabel(task.priority, locale)}`
                : `${getPriorityLabel(task.priority, locale)} priority`}
            </span>
            <span className="text-muted" aria-hidden>·</span>
            <span>
              {isVi
                ? `Ước tính ${formatMinutes(task.estimatedMinutes)}`
                : `${formatMinutes(task.estimatedMinutes)} estimated`}
            </span>
            {focusRequired > 0 ? (
              <>
                <span className="text-muted" aria-hidden>·</span>
                <span>
                  {inTodayPlan
                    ? isVi
                      ? `${formatMinutes(focusDone)} / ${formatMinutes(focusRequired)} tập trung`
                      : `${formatMinutes(focusDone)} / ${formatMinutes(focusRequired)} focus`
                    : isVi
                      ? `Cần ${formatMinutes(focusRequired)} tập trung`
                      : `${formatMinutes(focusRequired)} focus required`}
                </span>
              </>
            ) : null}
            {due ? (
              <>
                <span className="text-muted" aria-hidden>·</span>
                <span className={overdue ? "font-semibold text-danger" : "font-medium text-ink"}>
                  {due}
                </span>
              </>
            ) : task.dueDate ? (
              <>
                <span className="text-muted" aria-hidden>·</span>
                <span>
                  {isVi ? "Hạn" : "Due"} {formatDate(task.dueDate, undefined, timezone, locale)}
                </span>
              </>
            ) : null}
          </div>

          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{displayReason}</p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 pt-3">
            {ctaKind === "add_to_plan" ? (
              <>
                <ActionButton
                  action={addSuggestedTaskToTodayPlanAction.bind(null, {
                    planId,
                    taskId: task.id,
                    kind: task.kind,
                  })}
                  variant="outline"
                  size="sm"
                  pendingLabel={isVi ? "Đang thêm…" : "Adding…"}
                >
                  <CalendarPlus className="size-3.5" />{" "}
                  {isVi ? "Thêm vào kế hoạch hôm nay" : "Add to today's plan"}
                </ActionButton>
                <Link
                  href={`/tasks?view=open&kind=${task.kind}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-soft hover:text-ink hover:underline"
                >
                  {isVi ? "Xem nhiệm vụ" : "View task"} <ArrowRight className="size-3" />
                </Link>
              </>
            ) : ctaKind === "view_plan" ? (
              <>
                <Link
                  href="/planner"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {isVi ? "Xem kế hoạch hôm nay" : "View today's plan"} <ArrowRight className="size-3.5" />
                </Link>
                <Link
                  href={`/tasks?view=open&kind=${task.kind}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-ink-soft hover:text-ink hover:underline"
                >
                  {isVi ? "Xem nhiệm vụ" : "View task"} <ArrowRight className="size-3" />
                </Link>
              </>
            ) : (
              <Link
                href={`/tasks?view=open&kind=${task.kind}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                {isVi ? "Xem nhiệm vụ" : "View task"} <ArrowRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
