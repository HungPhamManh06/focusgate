import Link from "next/link";
import { ArrowRight, CheckCircle2, Compass, ListPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KindBadge, priorityLabels } from "@/components/domain/labels";
import type { NextMoveSuggestion } from "@/lib/data/dashboard";
import { formatDate, formatMinutes, relativeDue } from "@/lib/data/format";

export function NextMoveCard({
  suggestion,
  hasPlan,
  totalTasksCount,
  completedTasksCount,
  timezone,
}: {
  suggestion: NextMoveSuggestion | null;
  hasPlan: boolean;
  totalTasksCount: number;
  completedTasksCount: number;
  timezone: string;
}) {
  if (!suggestion) {
    const noTasksCreatedYet = totalTasksCount === 0 && completedTasksCount === 0 && !hasPlan;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-accent" strokeWidth={1.8} />
            <CardTitle>Your next move</CardTitle>
          </div>
          <Badge tone={noTasksCreatedYet ? "neutral" : "success"}>
            {noTasksCreatedYet ? "Start here" : "Clear"}
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
                {noTasksCreatedYet ? "Add your first task." : "You're all caught up."}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                {noTasksCreatedYet
                  ? "Create a few tasks in your backlog—starting with at least one Must-do—before building today's plan."
                  : "No outstanding tasks need your attention."}
              </p>
              {noTasksCreatedYet ? (
                <div className="mt-3">
                  <Link
                    href="/tasks"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Open tasks <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { task, inTodayPlan, focusDone, focusRequired, reason } = suggestion;
  const due = relativeDue(task.dueDate, timezone);
  const overdue = due?.includes("overdue") ?? false;

  return (
    <Card>
      <CardHeader>
        <div>
          <p className="label-xs text-muted">Your next move</p>
          <CardTitle className="mt-1.5">Recommended priority task</CardTitle>
        </div>
        <KindBadge kind={task.kind} />
      </CardHeader>

      <CardContent className="pt-4">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15.5px] font-semibold leading-snug text-ink">
              {task.title}
            </h3>
            {inTodayPlan ? <Badge tone="accent">In today&apos;s plan</Badge> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[12.5px] text-ink-soft tabular-nums">
            <span className="font-medium">{priorityLabels[task.priority]} priority</span>
            <span className="text-muted" aria-hidden>·</span>
            <span>{formatMinutes(task.estimatedMinutes)} estimated</span>
            {focusRequired > 0 ? (
              <>
                <span className="text-muted" aria-hidden>·</span>
                <span>
                  {inTodayPlan
                    ? `${formatMinutes(focusDone)} / ${formatMinutes(focusRequired)} focus`
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
                <span>Due {formatDate(task.dueDate, undefined, timezone)}</span>
              </>
            ) : null}
          </div>

          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{reason}</p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 pt-3">
            <Link
              href={`/tasks?view=open&kind=${task.kind}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View task <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
