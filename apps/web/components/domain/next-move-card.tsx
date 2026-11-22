import Link from "next/link";
import { ArrowRight, CheckCircle2, Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KindBadge, priorityLabels } from "@/components/domain/labels";
import type { NextMoveSuggestion } from "@/lib/data/dashboard";
import { formatDate, formatMinutes, relativeDue } from "@/lib/data/format";

export function NextMoveCard({
  suggestion,
  timezone,
}: {
  suggestion: NextMoveSuggestion | null;
  timezone: string;
}) {
  if (!suggestion) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Compass className="size-4 text-accent" strokeWidth={1.8} />
            <CardTitle>Your next move</CardTitle>
          </div>
          <Badge tone="success">Clear</Badge>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3.5 rounded-2xl border border-line bg-surface-2/60 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
              <CheckCircle2 className="size-4" strokeWidth={2} />
            </span>
            <div>
              <p className="text-[14px] font-semibold text-ink">
                You&apos;re all caught up.
              </p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
                Take a moment to review tomorrow&apos;s plan.
              </p>
              <div className="mt-3">
                <Link
                  href="/tasks"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View task queue <ArrowRight className="size-3.5" />
                </Link>
              </div>
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
          <CardTitle className="mt-1.5">Recommended focus target</CardTitle>
        </div>
        <KindBadge kind={task.kind} />
      </CardHeader>

      <CardContent className="pt-4">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-snug text-ink">
              {task.title}
            </h3>
            {inTodayPlan ? <Badge tone="accent">In today&apos;s plan</Badge> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted tabular-nums">
            <span>{priorityLabels[task.priority]} priority</span>
            <span aria-hidden>·</span>
            <span>{formatMinutes(task.estimatedMinutes)} est.</span>
            {focusRequired > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span>
                  {inTodayPlan
                    ? `${formatMinutes(focusDone)} / ${formatMinutes(focusRequired)} focus`
                    : `${formatMinutes(focusRequired)} focus required`}
                </span>
              </>
            ) : null}
            {due ? (
              <>
                <span aria-hidden>·</span>
                <span className={overdue ? "font-medium text-danger" : "text-ink-soft"}>
                  {due}
                </span>
              </>
            ) : task.dueDate ? (
              <>
                <span aria-hidden>·</span>
                <span>Due {formatDate(task.dueDate, undefined, timezone)}</span>
              </>
            ) : null}
          </div>

          <p className="mt-2.5 text-[12px] leading-relaxed text-muted">{reason}</p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 pt-3">
            <Link
              href={`/tasks?view=open&kind=${task.kind}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View task <ArrowRight className="size-3.5" />
            </Link>
            {!inTodayPlan ? (
              <Link
                href="/planner"
                className="text-[11.5px] font-medium text-accent hover:underline"
              >
                Add to today&apos;s plan
              </Link>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
