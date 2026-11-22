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
import { cn } from "@/lib/utils";

type StageState = "completed" | "current" | "locked";

interface JourneyStage {
  key: "plan" | "complete" | "focus" | "earn" | "unlock";
  label: string;
  description: string;
  icon: LucideIcon;
  state: StageState;
  progressText?: string;
}

function buildJourneyStages(
  plan: Plan | null,
  todayGrant: Grant | undefined,
): JourneyStage[] {
  if (!plan) {
    return [
      {
        key: "plan",
        label: "Plan",
        description: "Choose 1–3 Must-do tasks",
        icon: CalendarClock,
        state: "current",
      },
      {
        key: "complete",
        label: "Commit",
        description: "Confirm & lock the gate",
        icon: Lock,
        state: "locked",
      },
      {
        key: "focus",
        label: "Focus",
        description: "Log verified sessions",
        icon: Timer,
        state: "locked",
      },
      {
        key: "earn",
        label: "Complete",
        description: "Finish every Must-do",
        icon: Target,
        state: "locked",
      },
      {
        key: "unlock",
        label: "Unlock",
        description: "Claim reward minutes",
        icon: LockKeyhole,
        state: "locked",
      },
    ];
  }

  const { mustDoCompleted, mustDoTotal, focusDone, focusRequired } = plan.progress;
  const isDraft = plan.status === "draft";
  const isConfirmed = plan.status === "confirmed";
  const isActive = plan.status === "active";
  const isCompleted = plan.status === "completed";
  const isClaimed = Boolean(todayGrant);

  const allMustDosDone = mustDoTotal > 0 && mustDoCompleted >= mustDoTotal;
  const focusTargetMet = focusRequired === 0 || focusDone >= focusRequired;

  return [
    {
      key: "plan",
      label: "Plan",
      description: isDraft ? "Select today's Must-dos" : "Tasks selected",
      icon: CalendarClock,
      state: isDraft ? "current" : "completed",
      progressText: `${plan.tasks.length} task${plan.tasks.length === 1 ? "" : "s"}`,
    },
    {
      key: "complete",
      label: "Commit",
      description: isDraft
        ? "Confirm to lock the gate"
        : isConfirmed
          ? "Gate locked · activate focus"
          : "Daily contract locked",
      icon: Lock,
      state: isDraft ? "locked" : isConfirmed ? "current" : "completed",
      progressText: `${mustDoTotal} must-do${mustDoTotal === 1 ? "" : "s"}`,
    },
    {
      key: "focus",
      label: "Focus",
      description: isActive
        ? focusTargetMet
          ? "Focus target verified"
          : "Verify focus on Must-dos"
        : isCompleted
          ? "Verified sessions logged"
          : "Run verified timer blocks",
      icon: Timer,
      state:
        isCompleted || (isActive && focusTargetMet && allMustDosDone)
          ? "completed"
          : isActive
            ? "current"
            : "locked",
      progressText: `${formatMinutes(focusDone)} / ${formatMinutes(focusRequired)}`,
    },
    {
      key: "earn",
      label: "Complete",
      description: isCompleted
        ? "All Must-dos finished"
        : "Finish every Must-do task",
      icon: Target,
      state: isCompleted
        ? "completed"
        : isActive && focusTargetMet
          ? "current"
          : "locked",
      progressText: `${mustDoCompleted}/${mustDoTotal} done`,
    },
    {
      key: "unlock",
      label: "Unlock",
      description: isClaimed
        ? `Claimed ${formatMinutes(todayGrant!.grantedMinutes)}`
        : isCompleted
          ? "Ready to claim reward"
          : "Opens when day completes",
      icon: LockKeyhole,
      state: isClaimed ? "completed" : isCompleted ? "current" : "locked",
      progressText: isClaimed ? formatMinutes(todayGrant!.grantedMinutes) : undefined,
    },
  ];
}

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
  const stages = buildJourneyStages(plan, todayGrant);

  const progressPercent =
    plan && plan.progress.mustDoTotal > 0
      ? Math.round((plan.progress.mustDoCompleted / plan.progress.mustDoTotal) * 100)
      : 0;
  const focusPercent =
    plan && plan.progress.focusRequired > 0
      ? Math.min(100, Math.round((plan.progress.focusDone / plan.progress.focusRequired) * 100))
      : plan && plan.progress.mustDoTotal > 0
        ? 100
        : 0;

  const estimatedReward = plan
    ? Math.min(
        settings.dailyCapMinutes,
        settings.baseMinutes +
          Math.min(
            plan.progress.bonusCompleted * settings.bonusMinutesPerTask,
            settings.maxBonusMinutes,
          ),
      )
    : settings.baseMinutes;

  const remainingMustDos = plan
    ? Math.max(0, plan.progress.mustDoTotal - plan.progress.mustDoCompleted)
    : 0;
  const remainingFocus = plan
    ? Math.max(0, plan.progress.focusRequired - plan.progress.focusDone)
    : 0;
  const readyToCloseDay =
    plan?.status === "active" &&
    plan.progress.mustDoTotal > 0 &&
    remainingMustDos === 0 &&
    remainingFocus === 0;

  return (
    <Card className="flex flex-col justify-between overflow-hidden">
      <div>
        {/* Card Header */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-5 sm:px-7">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="label-xs text-muted">Today&apos;s mission</p>
              {plan ? <PlanStatusBadge status={plan.status} /> : <Badge tone="neutral">Not started</Badge>}
              {todayGrant ? <Badge tone="success">Reward claimed</Badge> : null}
            </div>
            <h2 className="mt-2 font-display text-[28px] leading-[1.06] tracking-[-0.015em] sm:text-[32px]">
              {!plan
                ? "Make today count."
                : plan.status === "draft"
                  ? "Lock in your commitments."
                  : plan.status === "confirmed"
                    ? "The gate is locked. Begin focus."
                    : plan.status === "active"
                      ? readyToCloseDay
                        ? "All commitments met. Close the day."
                        : "Stay with the work that unlocks today."
                      : todayGrant
                        ? "Today’s gate is complete and rewarded."
                        : "The work is done. Claim your time."}
            </h2>
            <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-muted">
              {!plan
                ? "Start by choosing a few things that really matter today."
                : plan.status === "draft"
                  ? plan.progress.mustDoTotal === 0
                    ? "Your draft has no Must-do tasks yet. Add at least one Must-do to form today's contract."
                    : `You have ${plan.progress.mustDoTotal} Must-do task${plan.progress.mustDoTotal === 1 ? "" : "s"} and ${formatMinutes(plan.progress.focusRequired)} of required focus ready to confirm.`
                  : plan.status === "confirmed"
                    ? `Your plan is confirmed with ${plan.progress.mustDoTotal} Must-do task${plan.progress.mustDoTotal === 1 ? "" : "s"} (${formatMinutes(plan.progress.focusRequired)} focus target). Activate focus mode to start logging verified sessions.`
                    : plan.status === "active"
                      ? readyToCloseDay
                        ? "Every Must-do task and verified focus requirement is complete. Close the day to unlock your reward grant."
                        : `${remainingMustDos} Must-do task${remainingMustDos === 1 ? "" : "s"} and ${formatMinutes(remainingFocus)} of verified focus remaining before the reward gate opens.`
                      : todayGrant
                        ? `You earned ${formatMinutes(todayGrant.grantedMinutes)} from today's plan (${formatMinutes(todayGrant.remainingMinutes)} currently remaining in this grant).`
                        : `You completed ${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} Must-do tasks with ${formatMinutes(plan.progress.focusDone)} of verified focus.`}
            </p>
          </div>

          {plan ? (
            <Link
              href="/planner"
              className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
            >
              Open planner <ArrowRight className="size-3.5" />
            </Link>
          ) : null}
        </div>

        {/* 5-Stage Journey Rail: PLAN -> COMMIT -> FOCUS -> COMPLETE -> UNLOCK */}
        <div className="border-b border-line bg-surface-2/50 px-5 py-4 sm:px-7">
          <ol
            aria-label="FocusGate daily journey"
            className="grid gap-2 sm:grid-cols-5"
          >
            {stages.map((stage, index) => {
              const StageIcon = stage.icon;
              const isCompleted = stage.state === "completed";
              const isCurrent = stage.state === "current";
              return (
                <li
                  key={stage.key}
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border px-3 py-2.5 transition-colors sm:flex-col sm:gap-1.5",
                    isCurrent
                      ? "border-accent/40 bg-accent-soft/65"
                      : isCompleted
                        ? "border-success/25 bg-success-soft/45"
                        : "border-line/80 bg-surface/70 opacity-75",
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold",
                        isCompleted
                          ? "bg-success text-white"
                          : isCurrent
                            ? "bg-accent text-white"
                            : "bg-line text-muted",
                      )}
                    >
                      {isCompleted ? (
                        <Check className="size-3.5" strokeWidth={2.8} />
                      ) : (
                        <StageIcon className="size-3.5" strokeWidth={2} />
                      )}
                    </span>
                    <span className="text-[10px] font-medium text-muted tabular-nums">
                      0{index + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        "text-[12px] font-semibold leading-tight",
                        isCurrent ? "text-accent" : isCompleted ? "text-ink" : "text-ink-soft",
                      )}
                    >
                      {stage.label}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-muted">
                      {stage.description}
                    </p>
                    {stage.progressText ? (
                      <p className="mt-1 text-[10px] font-medium text-ink-soft tabular-nums">
                        {stage.progressText}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Body Content by State */}
        <CardContent className="px-5 py-6 sm:px-7">
          {!plan ? (
            /* STATE A — NO PLAN */
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_230px] sm:items-center">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1 text-[11px] font-medium text-accent">
                  <Sparkles className="size-3.5" /> Step 1 of 5 · Build today&apos;s gate
                </div>
                <p className="text-[13.5px] leading-relaxed text-ink-soft">
                  FocusGate works through a simple daily contract: pick 1–3{" "}
                  <span className="font-medium text-ink">Must-do</span> tasks, verify your focus
                  with the server clock, and unlock{" "}
                  <span className="font-medium text-ink">
                    {formatMinutes(settings.baseMinutes)}
                  </span>{" "}
                  of guilt-free leisure time (plus up to{" "}
                  <span className="font-medium text-ink">
                    {formatMinutes(settings.maxBonusMinutes)}
                  </span>{" "}
                  from bonus tasks).
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-surface-2 p-4">
                <p className="label-xs text-muted">Gate rules</p>
                <ul className="mt-2.5 space-y-2 text-[11.5px] text-ink-soft">
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Base reward</span>
                    <span className="font-medium tabular-nums">{formatMinutes(settings.baseMinutes)}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Per bonus task</span>
                    <span className="font-medium tabular-nums">+{formatMinutes(settings.bonusMinutesPerTask)}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="text-muted">Min valid focus</span>
                    <span className="font-medium tabular-nums">{formatMinutes(settings.minValidFocusMinutes)}</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            /* STATES B, C, D, E — POPULATED PLAN */
            <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
              <div className="flex flex-col items-center">
                <ProgressRing value={progressPercent} size={136} stroke={8}>
                  <span className="font-display text-[32px] leading-none tabular-nums">
                    {plan.progress.mustDoCompleted}/{plan.progress.mustDoTotal}
                  </span>
                  <span className="label-xs mt-1.5 text-muted">must-do</span>
                </ProgressRing>
                <p className="mt-2 text-[11px] text-muted tabular-nums">
                  {progressPercent}% complete
                </p>
              </div>

              <div className="min-w-0 space-y-4">
                {/* Verified Focus Coverage Bar */}
                <div className="rounded-2xl border border-line bg-surface-2/60 px-4 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-[12px] font-medium text-ink-soft">
                      Verified focus coverage
                    </p>
                    <p className="text-[12px] font-semibold tabular-nums">
                      {formatMinutes(plan.progress.focusDone)}
                      <span className="font-normal text-muted">
                        {" "}
                        / {formatMinutes(plan.progress.focusRequired)} required ({focusPercent}%)
                      </span>
                    </p>
                  </div>
                  <Progress
                    value={focusPercent}
                    tone={focusPercent >= 100 ? "success" : "accent"}
                    className="mt-2"
                  />
                  {plan.status === "active" && latestSession ? (
                    <p className="mt-2 text-[11px] text-muted">
                      Last session: <span className="text-ink-soft">{latestSession.taskTitle ?? "Free focus"}</span>{" "}
                      ({formatMinutes(latestSession.actualMinutes)} at {formatTime(latestSession.startedAt, timezone)})
                    </p>
                  ) : null}
                </div>

                {/* Plan Task Checklist */}
                {plan.tasks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line bg-surface-2/40 px-4 py-3.5 text-[12.5px] text-muted">
                    This draft plan has no tasks yet.{" "}
                    <Link href="/planner" className="font-medium text-accent hover:underline">
                      Add tasks from your backlog in the planner
                    </Link>
                    .
                  </div>
                ) : (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
                      <span>
                        Committed tasks ({plan.tasks.filter((t) => Boolean(t.completedAt) || t.status === "completed").length}/
                        {plan.tasks.length} done)
                      </span>
                      <span>Est. reward: {formatMinutes(estimatedReward)}</span>
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
                              <CheckCircle2 className="size-4 shrink-0 text-success" strokeWidth={2} />
                            ) : (
                              <Circle className="size-4 shrink-0 text-muted/60" strokeWidth={1.8} />
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
                        +{plan.tasks.length - 4} more task{plan.tasks.length - 4 === 1 ? "" : "s"} in{" "}
                        <Link href="/planner" className="font-medium text-accent hover:underline">
                          today&apos;s plan
                        </Link>
                      </p>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </div>

      {/* Strict Footer Action Hierarchy */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-5 py-4 sm:px-7">
        {!plan ? (
          <>
            <ActionButton action={createPlanAction} variant="accent" size="md">
              <Sparkles className="size-4" /> Create today&apos;s plan
            </ActionButton>
            <Link href="/tasks" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Review task backlog
            </Link>
          </>
        ) : plan.status === "draft" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={confirmPlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                confirmTitle="Lock today's gate?"
                confirmMessage="Confirming locks your Must-do commitments for the day. Any later downgrade requires an audited exception."
                confirmLabel="Confirm & lock plan"
                disabled={plan.progress.mustDoTotal === 0}
                pendingLabel="Confirming…"
              >
                <Lock className="size-4" /> Confirm plan
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                Edit plan
              </Link>
            </div>
            {plan.progress.mustDoTotal === 0 ? (
              <p className="text-[11.5px] text-warning">
                Add at least one Must-do task before confirming.
              </p>
            ) : (
              <p className="text-[11.5px] text-muted">
                Draft status — confirm to lock commitments.
              </p>
            )}
          </>
        ) : plan.status === "confirmed" ? (
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
              Next step: activate focus mode to begin logging verified time.
            </p>
          </>
        ) : plan.status === "active" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {readyToCloseDay ? (
                <>
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
                  <Link href="/focus" className={buttonVariants({ variant: "outline", size: "md" })}>
                    <Timer className="size-4" /> Go to focus
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/focus" className={buttonVariants({ variant: "accent", size: "md" })}>
                    <Timer className="size-4" /> Go to focus
                  </Link>
                  <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                    View plan
                  </Link>
                  <ActionButton
                    action={completePlanAction.bind(null, plan.id)}
                    variant="ghost"
                    size="sm"
                    confirmTitle="Close today's plan?"
                    confirmMessage="Closing the day requires every Must-do task and its verified focus target to be complete."
                    confirmLabel="Complete day"
                  >
                    Complete day
                  </ActionButton>
                </>
              )}
            </div>
          </>
        ) : plan.status === "completed" ? (
          todayGrant ? (
            <>
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-success">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>
                  Reward claimed ({formatMinutes(todayGrant.grantedMinutes)} added to wallet)
                </span>
              </div>
              <Link href="/wallet" className={buttonVariants({ variant: "outline", size: "sm" })}>
                Spend in wallet <ArrowRight className="size-3.5" />
              </Link>
            </>
          ) : (
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
                Est. grant: {formatMinutes(estimatedReward)} (expires 04:00 tomorrow).
              </p>
            </>
          )
        ) : null}
      </div>
    </Card>
  );
}
