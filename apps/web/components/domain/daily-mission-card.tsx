import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Flame,
  Lock,
  LockKeyhole,
  Sparkles,
  Target,
  Timer,
  type LucideIcon,
} from "lucide-react";
import {
  activatePlanAction,
  completePlanAction,
  confirmPlanAction,
  createPlanAction,
} from "@/lib/actions/planner";
import { claimRewardAction } from "@/lib/actions/rewards";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress, ProgressRing } from "@/components/ui/progress";
import { KindBadge, PlanStatusBadge } from "@/components/domain/labels";
import { formatMinutes, formatTime } from "@/lib/data/format";
import type { FocusSession, Grant, Plan, RewardSettings } from "@/lib/data/types";
import {
  buildMissionViewModel,
  type StageKey,
} from "@/lib/domain/dashboard-state";
import { cn } from "@/lib/utils";

const STAGE_ICONS: Record<StageKey, LucideIcon> = {
  plan: CalendarClock,
  commit: Lock,
  focus: Timer,
  complete: Target,
  unlock: LockKeyhole,
};

export function DailyMissionCard({
  plan,
  settings,
  todayGrant,
  latestSession,
  timezone,
}: {
  plan: Plan | null;
  settings: RewardSettings;
  todayGrant?: Grant;
  latestSession?: FocusSession;
  timezone: string;
}) {
  const vm = buildMissionViewModel(plan, settings, todayGrant);

  return (
    <Card className="flex flex-col justify-between overflow-hidden">
      <div>
        {/* Card Header — Status badges only, no duplicate Planner CTA link */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <p className="label-xs text-muted">Today&apos;s mission</p>
            {plan ? (
              <PlanStatusBadge status={plan.status} />
            ) : (
              <Badge tone="neutral">Not started</Badge>
            )}
            {todayGrant ? <Badge tone="success">Reward claimed</Badge> : null}
          </div>
          <span className="text-[11.5px] font-medium text-muted tabular-nums">
            Step {vm.currentStepNumber} of 05 · {vm.currentStepLabel}
          </span>
        </div>

        {/* 5-Stage Journey Rail — Minimalist & readable, horizontally scrollable on narrow mobile */}
        <div className="border-b border-line bg-surface-2/50 px-5 py-3.5 sm:px-7">
          <div className="-mx-1 overflow-x-auto px-1 pb-0.5">
            <ol
              aria-label="FocusGate daily journey"
              className="grid min-w-[540px] grid-cols-5 gap-2 sm:min-w-0"
            >
              {vm.stages.map((stage) => {
                const StageIcon = STAGE_ICONS[stage.key];
                const isCompleted = stage.state === "completed";
                const isCurrent = stage.state === "current";
                return (
                  <li
                    key={stage.key}
                    aria-current={isCurrent ? "step" : undefined}
                    className={cn(
                      "flex flex-col justify-between rounded-xl border px-3 py-2.5 transition-colors",
                      isCurrent
                        ? "border-accent/45 bg-accent-soft/75"
                        : isCompleted
                          ? "border-success/30 bg-success-soft/45"
                          : "border-line bg-surface",
                    )}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full",
                          isCompleted
                            ? "bg-success text-white"
                            : isCurrent
                              ? "bg-accent text-white"
                              : "bg-surface-2 text-ink-soft",
                        )}
                      >
                        {isCompleted ? (
                          <Check className="size-3.5" strokeWidth={2.8} />
                        ) : isCurrent ? (
                          <StageIcon className="size-3.5" strokeWidth={2} />
                        ) : (
                          <Lock className="size-3" strokeWidth={1.9} />
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[10.5px] font-semibold tabular-nums",
                          isCurrent
                            ? "text-accent"
                            : isCompleted
                              ? "text-success"
                              : "text-ink-soft",
                        )}
                      >
                        {stage.stepNumber}
                      </span>
                    </div>

                    <div className="mt-2">
                      <p
                        className={cn(
                          "text-[12.5px] font-semibold leading-tight",
                          isCurrent ? "text-accent" : "text-ink",
                        )}
                      >
                        {stage.label}
                      </p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] leading-snug text-ink-soft">
                        {isCompleted ? "Completed" : stage.shortDescription}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Focused Current Step Spotlight + Honest Progress Details */}
        <CardContent className="space-y-5 px-5 py-6 sm:px-7">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="max-w-xl">
              <p className="label-xs text-accent">
                Step {vm.currentStepNumber} · {vm.currentStepLabel}
              </p>
              <h2 className="mt-2 font-display text-[28px] leading-[1.06] tracking-[-0.015em] sm:text-[32px]">
                {vm.headline}
              </h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
                {vm.description}
              </p>
            </div>

            <div className="shrink-0 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 sm:text-right">
              <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-muted">
                Current status
              </p>
              <p className="mt-1 text-[12.5px] font-semibold text-ink tabular-nums">
                {vm.statusLine}
              </p>
            </div>
          </div>

          {!plan ? (
            /* STATE A — NO PLAN: Explain how Must-do tasks power the daily gate */
            <div className="grid gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:grid-cols-3">
              <div>
                <p className="text-[11px] font-medium text-muted">Base reward</p>
                <p className="mt-1 font-display text-[24px] leading-none tabular-nums">
                  {formatMinutes(settings.baseMinutes)}
                </p>
                <p className="mt-1 text-[11px] text-muted">Unlocked when Must-dos finish</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted">Bonus upside</p>
                <p className="mt-1 font-display text-[24px] leading-none tabular-nums">
                  +{formatMinutes(settings.bonusMinutesPerTask)}
                </p>
                <p className="mt-1 text-[11px] text-muted">
                  Per bonus task (up to {formatMinutes(settings.maxBonusMinutes)})
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-muted">Verified focus rule</p>
                <p className="mt-1 font-display text-[24px] leading-none tabular-nums">
                  {formatMinutes(settings.minValidFocusMinutes)} min
                </p>
                <p className="mt-1 text-[11px] text-muted">Minimum valid session length</p>
              </div>
            </div>
          ) : (
            /* STATES B, C, D, E — POPULATED PLAN: Honest progress without 0/0 or misleading 0% */
            <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              {vm.hasMustDos && vm.mustDoPercent !== null ? (
                <div className="flex flex-col items-center">
                  <ProgressRing
                    value={vm.mustDoPercent}
                    size={128}
                    stroke={8}
                    label="Must-do completion progress"
                  >
                    <span className="font-display text-[30px] leading-none tabular-nums">
                      {plan.progress.mustDoCompleted}/{plan.progress.mustDoTotal}
                    </span>
                    <span className="label-xs mt-1.5 text-muted">must-do</span>
                  </ProgressRing>
                  <p className="mt-2 text-[11px] text-muted tabular-nums">
                    {vm.mustDoPercent === 0 && plan.status === "draft"
                      ? "Ready to confirm"
                      : `${vm.mustDoPercent}% complete`}
                  </p>
                </div>
              ) : (
                <div className="flex h-[128px] w-[128px] shrink-0 flex-col items-center justify-center self-center rounded-full border border-dashed border-line bg-surface-2/60 px-3 text-center">
                  <Target className="size-4 text-muted" strokeWidth={1.8} />
                  <p className="mt-1.5 text-[11.5px] font-semibold text-ink">
                    No Must-do tasks yet
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted">
                    Awaiting your first task
                  </p>
                </div>
              )}

              <div className="min-w-0 space-y-4">
                {/* Verified Focus Coverage — never shows 0m / 0m (0%) when focus target is not set */}
                <div className="rounded-2xl border border-line bg-surface-2/60 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[12px] font-medium text-ink-soft">
                      Verified focus coverage
                    </p>
                    {vm.hasFocusTarget && vm.focusPercent !== null ? (
                      <p className="text-[12px] font-semibold tabular-nums">
                        {formatMinutes(plan.progress.focusDone)}
                        <span className="font-normal text-muted">
                          {" "}
                          / {formatMinutes(plan.progress.focusRequired)} completed ({vm.focusPercent}%)
                        </span>
                      </p>
                    ) : (
                      <p className="text-[12px] font-medium text-muted">
                        Focus target not set
                      </p>
                    )}
                  </div>

                  {vm.hasFocusTarget && vm.focusPercent !== null ? (
                    <Progress
                      value={vm.focusPercent}
                      tone={vm.focusPercent >= 100 ? "success" : "accent"}
                      label="Verified focus coverage"
                      className="mt-2"
                    />
                  ) : (
                    <p className="mt-1.5 text-[11.5px] text-muted">
                      {vm.hasMustDos
                        ? "Your selected Must-do tasks require 0 focus minutes."
                        : "Add a Must-do task with focus minutes in the planner to set today's target."}
                    </p>
                  )}

                  {plan.status === "active" && latestSession ? (
                    <p className="mt-2 text-[11px] text-muted">
                      Latest session:{" "}
                      <span className="font-medium text-ink-soft">
                        {latestSession.taskTitle ?? "Free focus"}
                      </span>{" "}
                      ({formatMinutes(latestSession.actualMinutes)} at{" "}
                      {formatTime(latestSession.startedAt, timezone)})
                    </p>
                  ) : null}
                </div>

                {/* Committed Task List */}
                {plan.tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-3 text-[12.5px] text-muted">
                    No tasks selected in this draft yet. Add at least one Must-do from your backlog to define today&apos;s gate.
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
                      <span>
                        Selected tasks (
                        {
                          plan.tasks.filter(
                            (t) => Boolean(t.completedAt) || t.status === "completed",
                          ).length
                        }{" "}
                        of {plan.tasks.length} done)
                      </span>
                      <span className="tabular-nums">
                        Est. reward: {formatMinutes(vm.estimatedReward)}
                      </span>
                    </div>
                    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                      {plan.tasks.slice(0, 4).map((task) => {
                        const done = Boolean(task.completedAt) || task.status === "completed";
                        const taskFocusLeft = Math.max(
                          0,
                          task.requiredFocusMinutes - task.focusDone,
                        );
                        return (
                          <li
                            key={task.id}
                            className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]"
                          >
                            {done ? (
                              <CheckCircle2
                                className="size-4 shrink-0 text-success"
                                strokeWidth={2}
                              />
                            ) : (
                              <Circle
                                className="size-4 shrink-0 text-muted/60"
                                strokeWidth={1.8}
                              />
                            )}
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate",
                                done ? "text-muted line-through" : "font-medium text-ink",
                              )}
                            >
                              {task.title}
                            </span>
                            {!done && task.requiredFocusMinutes > 0 ? (
                              <span className="hidden shrink-0 text-[11px] text-muted tabular-nums sm:inline">
                                {taskFocusLeft > 0
                                  ? `${formatMinutes(taskFocusLeft)} focus left`
                                  : "focus met"}
                              </span>
                            ) : null}
                            <KindBadge kind={task.kind} />
                          </li>
                        );
                      })}
                    </ul>
                    {plan.tasks.length > 4 ? (
                      <p className="mt-2 text-[11px] text-muted">
                        +{plan.tasks.length - 4} more task
                        {plan.tasks.length - 4 === 1 ? "" : "s"} in today&apos;s plan
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </div>

      {/* Footer Actions — Strictly 1 Primary + at most 1 Secondary CTA, no duplicate destinations */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-5 py-4 sm:px-7">
        {vm.phase === "no_plan" ? (
          <>
            <ActionButton action={createPlanAction} variant="accent" size="md">
              <Sparkles className="size-4" /> Create today&apos;s plan
            </ActionButton>
            <p className="text-[11.5px] text-muted">
              Step 1 of 5 · Establish today&apos;s Must-do contract.
            </p>
          </>
        ) : vm.phase === "draft_empty" ? (
          <>
            <Link href="/planner" className={buttonVariants({ variant: "accent", size: "md" })}>
              <CalendarClock className="size-4" /> Add tasks to today&apos;s plan
            </Link>
            <p className="text-[11.5px] text-warning">
              Add at least one Must-do task before confirming.
            </p>
          </>
        ) : vm.phase === "draft_ready" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={confirmPlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                confirmTitle="Lock today's gate?"
                confirmMessage="Confirming locks your Must-do commitments for the day. Any later downgrade requires an audited exception."
                confirmLabel="Confirm & lock plan"
                pendingLabel="Confirming…"
              >
                <Lock className="size-4" /> Confirm plan
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                Edit plan
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              Draft ready — confirm to lock your Must-do commitments.
            </p>
          </>
        ) : vm.phase === "confirmed" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={activatePlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                pendingLabel="Activating…"
              >
                <Flame className="size-4" /> Activate focus
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                View plan
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              Activate focus mode to start logging verified sessions.
            </p>
          </>
        ) : vm.phase === "active_focus" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/focus" className={buttonVariants({ variant: "accent", size: "md" })}>
                <Timer className="size-4" /> Continue focus
              </Link>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                View plan
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              Complete verified focus and mark Must-dos done in the planner.
            </p>
          </>
        ) : vm.phase === "active_ready_to_close" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={completePlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                confirmTitle="Close today's plan?"
                confirmMessage="Every Must-do task and focus target is complete. Close the day to unlock your reward?"
                confirmLabel="Complete day"
              >
                <CheckCircle2 className="size-4" /> Complete day
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                View plan
              </Link>
            </div>
            <p className="text-[11.5px] text-success">
              All Must-dos verified — close the day to claim your reward.
            </p>
          </>
        ) : vm.phase === "completed_unclaimed" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={claimRewardAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                pendingLabel="Claiming…"
              >
                <Sparkles className="size-4" /> Claim today&apos;s reward
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                View summary
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              Est. grant: {formatMinutes(vm.estimatedReward)} (expires 04:00 tomorrow).
            </p>
          </>
        ) : vm.phase === "completed_claimed" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/wallet" className={buttonVariants({ variant: "accent", size: "md" })}>
                View wallet <ArrowRight className="size-4" />
              </Link>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                Review today&apos;s progress
              </Link>
            </div>
            <p className="text-[11.5px] font-medium text-success">
              Reward claimed and added to your wallet.
            </p>
          </>
        ) : null}
      </div>
    </Card>
  );
}
