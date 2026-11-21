import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Circle,
  Flame,
  ListTodo,
  LockKeyhole,
  Sparkles,
  Target,
  Timer,
  Wallet,
} from "lucide-react";
import {
  activatePlanAction,
  completePlanAction,
  confirmPlanAction,
  createPlanAction,
} from "@/lib/actions/planner";
import { claimRewardAction } from "@/lib/actions/rewards";
import { ActionButton } from "@/components/ui/action-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress, ProgressRing } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { KindBadge, PlanStatusBadge } from "@/components/domain/labels";
import { getUpcomingTasks } from "@/lib/data/dashboard";
import {
  formatDate,
  formatMinutes,
  formatTime,
  greeting,
  relativeDue,
} from "@/lib/data/format";
import { getRecentSessions, getTodayFocusSummary } from "@/lib/data/focus";
import { getTodayPlan } from "@/lib/data/planner";
import { getWallet } from "@/lib/data/rewards";
import { getTaskCounts } from "@/lib/data/tasks";
import { getWorkspace } from "@/lib/data/workspace";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [workspace, plan, focus, wallet, upcoming, sessions, counts] = await Promise.all([
    getWorkspace(),
    getTodayPlan(),
    getTodayFocusSummary(),
    getWallet(),
    getUpcomingTasks(4),
    getRecentSessions(4),
    getTaskCounts(),
  ]);

  const { timezone, displayName } = workspace.profile;
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(new Date());

  const progressPercent =
    plan && plan.progress.mustDoTotal > 0
      ? Math.round((plan.progress.mustDoCompleted / plan.progress.mustDoTotal) * 100)
      : 0;
  const focusPercent =
    plan && plan.progress.focusRequired > 0
      ? Math.round((plan.progress.focusDone / plan.progress.focusRequired) * 100)
      : 0;
  const activeGrants = wallet.grants.filter(
    (grant) => grant.status === "active" && new Date(grant.expiresAt) > new Date(),
  );
  const nextGrant = activeGrants[0];

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={dateLabel}
        title={`${greeting(timezone)}, ${firstName}.`}
        description="The gate is simple: finish what matters, earn your time, then enjoy it without guilt."
        actions={
          <>
            <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
              <CalendarClock className="size-4" /> Open planner
            </Link>
            <Link href="/focus" className={buttonVariants({ variant: "accent", size: "md" })}>
              <Timer className="size-4" /> Start focus
            </Link>
          </>
        }
      />

      <section className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Today at a glance">
        <StatCard
          label="Focus today"
          value={formatMinutes(focus.minutes)}
          hint={`${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} of ${focus.sessions}`}
          icon={Timer}
          tone="accent"
        />
        <StatCard
          label="Open tasks"
          value={String(counts.open)}
          hint={`${counts.mustDoOpen} must-do · ${counts.completed} completed all time`}
          icon={ListTodo}
        />
        <StatCard
          label="Plan progress"
          value={plan ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal}` : "—"}
          hint={plan ? "Must-do tasks completed" : "No plan created today"}
          icon={Target}
          tone={progressPercent === 100 && plan ? "success" : "default"}
        />
        <StatCard
          label="Unlocked time"
          value={formatMinutes(wallet.availableMinutes)}
          hint={`${wallet.earnedMinutes} earned · ${wallet.consumedMinutes} spent`}
          icon={LockKeyhole}
          tone="warning"
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Today&apos;s gate</CardTitle>
                {plan ? <PlanStatusBadge status={plan.status} /> : null}
              </div>
              <p className="mt-1.5 text-[12.5px] text-muted">
                {plan
                  ? "Complete every must-do with verified focus to open the reward."
                  : "Create today's plan to decide what deserves your attention."}
              </p>
            </div>
            <Link
              href="/planner"
              className="hidden items-center gap-1 text-[11.5px] font-medium text-accent hover:underline sm:inline-flex"
            >
              Details <ArrowRight className="size-3" />
            </Link>
          </CardHeader>

          <CardContent>
            {!plan ? (
              <EmptyState
                icon={Sparkles}
                title="No plan for today yet"
                description="Pick a few must-do tasks, add focused minutes, and let FocusGate protect the rest of your day."
                action={
                  <ActionButton action={createPlanAction} variant="accent">
                    Create today&apos;s plan
                  </ActionButton>
                }
              />
            ) : (
              <div className="grid gap-6 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="flex justify-center sm:justify-start">
                  <ProgressRing value={progressPercent} size={132} stroke={7}>
                    <span className="font-display text-[30px] leading-none">
                      {plan.progress.mustDoCompleted}/{plan.progress.mustDoTotal}
                    </span>
                    <span className="label-xs mt-1.5 text-muted">must-do</span>
                  </ProgressRing>
                </div>

                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[12px] text-muted">Verified focus</p>
                    <p className="text-[12px] font-medium">
                      {formatMinutes(plan.progress.focusDone)}
                      <span className="text-muted"> / {formatMinutes(plan.progress.focusRequired)}</span>
                    </p>
                  </div>
                  <Progress value={focusPercent} className="mt-2" />

                  <ul className="mt-5 space-y-2.5">
                    {plan.tasks.length === 0 ? (
                      <li className="rounded-xl bg-surface-2 px-3.5 py-3 text-[12.5px] text-muted">
                        The plan is empty.{" "}
                        <Link href="/planner" className="font-medium text-accent hover:underline">
                          Add your must-dos
                        </Link>
                        .
                      </li>
                    ) : (
                      plan.tasks.slice(0, 4).map((task) => {
                        const done = Boolean(task.completedAt) || task.status === "completed";
                        return (
                          <li key={task.id} className="flex items-center gap-2.5">
                            {done ? (
                              <CheckCircle2 className="size-4 shrink-0 text-success" strokeWidth={2} />
                            ) : (
                              <Circle className="size-4 shrink-0 text-muted/60" strokeWidth={1.8} />
                            )}
                            <span
                              className={
                                done
                                  ? "min-w-0 flex-1 truncate text-[13px] text-muted line-through"
                                  : "min-w-0 flex-1 truncate text-[13px]"
                              }
                            >
                              {task.title}
                            </span>
                            <KindBadge kind={task.kind} />
                          </li>
                        );
                      })
                    )}
                  </ul>

                  {plan.tasks.length > 4 ? (
                    <p className="mt-2.5 text-[11px] text-muted">+{plan.tasks.length - 4} more in the planner</p>
                  ) : null}
                </div>
              </div>
            )}

            {plan ? (
              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                {plan.status === "draft" ? (
                  <>
                    <ActionButton
                      action={confirmPlanAction.bind(null, plan.id)}
                      variant="accent"
                      size="sm"
                      confirmMessage="Confirm this plan? Tasks are locked once confirmed."
                      disabled={plan.tasks.length === 0}
                    >
                      Confirm plan
                    </ActionButton>
                    <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Edit tasks
                    </Link>
                  </>
                ) : null}
                {plan.status === "confirmed" ? (
                  <>
                    <ActionButton action={activatePlanAction.bind(null, plan.id)} variant="accent" size="sm">
                      <Flame className="size-3.5" /> Activate focus
                    </ActionButton>
                    <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      View plan
                    </Link>
                  </>
                ) : null}
                {plan.status === "active" ? (
                  <>
                    <Link href="/focus" className={buttonVariants({ variant: "accent", size: "sm" })}>
                      <Timer className="size-3.5" /> Go to focus
                    </Link>
                    <ActionButton
                      action={completePlanAction.bind(null, plan.id)}
                      variant="outline"
                      size="sm"
                      confirmMessage="Close the day? Unfinished must-do tasks will block the reward."
                    >
                      Complete day
                    </ActionButton>
                  </>
                ) : null}
                {plan.status === "completed" ? (
                  <>
                    <ActionButton action={claimRewardAction.bind(null, plan.id)} variant="accent" size="sm">
                      <Sparkles className="size-3.5" /> Claim today&apos;s reward
                    </ActionButton>
                    <Link href="/wallet" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Open wallet
                    </Link>
                  </>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-accent-soft/70 blur-2xl" />
          <CardContent className="relative flex h-full flex-col">
            <div className="flex items-center justify-between">
              <p className="label-xs text-muted">Reward wallet</p>
              <Wallet className="size-4 text-accent" strokeWidth={1.8} />
            </div>
            <p className="mt-4 font-display text-[46px] leading-none tracking-[-0.025em]">
              {formatMinutes(wallet.availableMinutes)}
            </p>
            <p className="mt-2 text-[12px] text-muted">ready to spend</p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="text-[10px] text-muted">Earned</p>
                <p className="mt-0.5 text-[13px] font-medium">{formatMinutes(wallet.earnedMinutes)}</p>
              </div>
              <div className="rounded-xl bg-surface-2 px-3 py-2.5">
                <p className="text-[10px] text-muted">Spent</p>
                <p className="mt-0.5 text-[13px] font-medium">{formatMinutes(wallet.consumedMinutes)}</p>
              </div>
            </div>

            <div className="mt-5 flex-1">
              {nextGrant ? (
                <div className="rounded-xl border border-line px-3 py-2.5">
                  <p className="text-[11px] font-medium">{formatMinutes(nextGrant.remainingMinutes)} available</p>
                  <p className="mt-0.5 text-[10.5px] text-muted">
                    Expires{" "}
                    {formatDate(
                      nextGrant.expiresAt,
                      { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                      timezone,
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-[11.5px] leading-relaxed text-muted">
                  No active grants. Finish a plan to earn your first block.
                </p>
              )}
            </div>

            <Link
              href="/wallet"
              className="mt-5 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
            >
              Open wallet <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Due soon</CardTitle>
              <p className="mt-1 text-[12px] text-muted">Open tasks with a deadline.</p>
            </div>
            <Link href="/tasks" className="text-[11.5px] font-medium text-accent hover:underline">
              All tasks
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={ListTodo}
                title="Nothing due"
                description="No open task has a deadline. That is either excellent planning or a quiet week."
                className="px-5 py-7"
              />
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((task) => {
                  const due = relativeDue(task.dueDate, timezone);
                  return (
                    <li key={task.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
                        <ListTodo className="size-3.5" strokeWidth={1.8} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium">{task.title}</p>
                        <p className="mt-0.5 text-[11px] text-muted">
                          {due ?? formatDate(task.dueDate, undefined, timezone)} · {task.estimatedMinutes}m
                        </p>
                      </div>
                      <KindBadge kind={task.kind} />
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Recent focus</CardTitle>
              <p className="mt-1 text-[12px] text-muted">Your last completed sessions.</p>
            </div>
            <Link href="/statistics" className="text-[11.5px] font-medium text-accent hover:underline">
              Statistics
            </Link>
          </CardHeader>
          <CardContent className="pt-4">
            {sessions.length === 0 ? (
              <EmptyState
                icon={Timer}
                title="No sessions yet"
                description="The first focused block is the hardest. Start one from the Focus screen."
                className="px-5 py-7"
              />
            ) : (
              <ul className="divide-y divide-line">
                {sessions.map((session) => (
                  <li key={session.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        session.isValid ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                      }`}
                    >
                      <Timer className="size-3.5" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium">
                        {session.taskTitle ?? "Free focus"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {formatTime(session.startedAt, timezone)} · {session.actualMinutes}m ·{" "}
                        {session.isValid ? "valid" : "below minimum"}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium text-ink-soft">
                      {formatMinutes(session.actualMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
