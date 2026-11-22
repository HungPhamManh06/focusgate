import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Flame,
  ListTodo,
  Sparkles,
  Target,
  Timer,
} from "lucide-react";
import {
  activatePlanAction,
  completePlanAction,
  createPlanAction,
} from "@/lib/actions/planner";
import { claimRewardAction } from "@/lib/actions/rewards";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { DailyMissionCard } from "@/components/domain/daily-mission-card";
import { KindBadge } from "@/components/domain/labels";
import { NextMoveCard } from "@/components/domain/next-move-card";
import { RewardWalletCard } from "@/components/domain/reward-wallet-card";
import { getNextMoveCandidate, getUpcomingTasks } from "@/lib/data/dashboard";
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

  const nextMove = await getNextMoveCandidate(plan);

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

  const todayGrant = plan
    ? wallet.grants.find(
        (grant) => grant.dailyPlanId === plan.id && grant.source === "daily_plan_base",
      )
    : undefined;

  const readyToCloseDay =
    plan?.status === "active" &&
    plan.progress.mustDoTotal > 0 &&
    plan.progress.mustDoCompleted >= plan.progress.mustDoTotal &&
    plan.progress.focusDone >= plan.progress.focusRequired;

  // Single state-driven Header CTA (One screen. One clear next action.)
  function renderHeaderAction() {
    if (!plan) {
      return (
        <ActionButton action={createPlanAction} variant="accent" size="md">
          <Sparkles className="size-4" /> Create today&apos;s plan
        </ActionButton>
      );
    }

    if (plan.status === "draft") {
      return (
        <Link href="/planner" className={buttonVariants({ variant: "accent", size: "md" })}>
          <CalendarClock className="size-4" /> Continue planning
        </Link>
      );
    }

    if (plan.status === "confirmed") {
      return (
        <ActionButton
          action={activatePlanAction.bind(null, plan.id)}
          variant="accent"
          size="md"
          pendingLabel="Activating…"
        >
          <Flame className="size-4" /> Activate focus
        </ActionButton>
      );
    }

    if (plan.status === "active") {
      if (readyToCloseDay) {
        return (
          <ActionButton
            action={completePlanAction.bind(null, plan.id)}
            variant="accent"
            size="md"
            confirmTitle="Close today's plan?"
            confirmMessage="All Must-do commitments and verified focus targets are met. Complete the day to unlock your reward?"
            confirmLabel="Complete day"
          >
            <Sparkles className="size-4" /> Complete day
          </ActionButton>
        );
      }
      return (
        <Link href="/focus" className={buttonVariants({ variant: "accent", size: "md" })}>
          <Timer className="size-4" /> Go to focus
        </Link>
      );
    }

    if (plan.status === "completed") {
      if (todayGrant) {
        return (
          <Link href="/wallet" className={buttonVariants({ variant: "outline", size: "md" })}>
            Open reward wallet <ArrowRight className="size-4" />
          </Link>
        );
      }
      return (
        <ActionButton
          action={claimRewardAction.bind(null, plan.id)}
          variant="accent"
          size="md"
          pendingLabel="Claiming…"
        >
          <Sparkles className="size-4" /> Claim reward
        </ActionButton>
      );
    }

    return (
      <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
        <CalendarClock className="size-4" /> Open planner
      </Link>
    );
  }

  const otherOpenCount = Math.max(0, counts.open - counts.mustDoOpen);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-8 sm:py-9">
      {/* 1. Greeting Header */}
      <PageHeader
        eyebrow={dateLabel}
        title={`${greeting(timezone)}, ${firstName}.`}
        description="Make today count. Finish what matters, focus deeply, and earn your time."
        actions={renderHeaderAction()}
      />

      {/* 2. Daily Overview — 3 focused stat cards without duplicate Unlocked Time */}
      <section
        className="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Daily overview"
      >
        <StatCard
          label="Focus today"
          value={formatMinutes(focus.minutes)}
          hint={
            plan && plan.progress.focusRequired > 0
              ? `${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} · ${formatMinutes(plan.progress.focusDone)} of ${formatMinutes(plan.progress.focusRequired)} plan target`
              : `${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} of ${focus.sessions} today`
          }
          icon={Timer}
          tone="accent"
          className="flex h-full flex-col justify-between"
        />

        <Link
          href="/tasks"
          className="group block h-full rounded-[18px] focus-visible:outline-2 focus-visible:outline-accent"
        >
          <StatCard
            label="Open tasks"
            value={String(counts.open)}
            hint={`${counts.mustDoOpen} must-do · ${otherOpenCount} should-do & bonus →`}
            icon={ListTodo}
            className="flex h-full flex-col justify-between transition-colors group-hover:border-ink/25"
          />
        </Link>

        <StatCard
          label="Plan progress"
          value={
            plan
              ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal}`
              : "No plan"
          }
          hint={
            plan
              ? `${progressPercent}% of today's Must-do gate completed`
              : "Create today's plan to set your Must-do gate"
          }
          icon={Target}
          tone={progressPercent === 100 && plan && plan.progress.mustDoTotal > 0 ? "success" : "default"}
          className="flex h-full flex-col justify-between sm:col-span-2 lg:col-span-1"
        />
      </section>

      {/* 3. Main Content — Today's Mission (~66%) + Reward Wallet (~34%) */}
      <section
        className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(320px,1fr)]"
        aria-label="Today's mission and reward wallet"
      >
        <DailyMissionCard
          plan={plan}
          settings={workspace.settings}
          todayGrant={todayGrant}
          latestSession={sessions[0]}
          timezone={timezone}
        />

        <RewardWalletCard wallet={wallet} timezone={timezone} />
      </section>

      {/* 4. Supporting Information — Your Next Move + Due Soon | Recent Focus */}
      <section
        className="mt-6 grid gap-4 lg:grid-cols-2"
        aria-label="Next move, upcoming deadlines, and recent focus"
      >
        <div className="space-y-4">
          <NextMoveCard suggestion={nextMove} timezone={timezone} />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Due soon</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  Nearest deadlines in your open work queue.
                </p>
              </div>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
              >
                View all tasks <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="No upcoming deadlines"
                  description="None of your open tasks have a due date assigned right now."
                  className="px-5 py-7"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {upcoming.map((task) => {
                    const due = relativeDue(task.dueDate, timezone);
                    const overdue = due?.includes("overdue") ?? false;
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[13px] font-medium text-ink">
                              {task.title}
                            </p>
                            {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                            <span className={overdue ? "font-medium text-danger" : undefined}>
                              {due ?? formatDate(task.dueDate, undefined, timezone)}
                            </span>{" "}
                            · {formatMinutes(task.estimatedMinutes)} est.
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
        </div>

        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <div>
                <CardTitle>Recent focus</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  Your last verified and logged focus blocks.
                </p>
              </div>
              <Link
                href="/statistics"
                className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
              >
                Statistics <ArrowRight className="size-3" />
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {sessions.length === 0 ? (
                <EmptyState
                  icon={Timer}
                  title="No focus sessions yet"
                  description="Start your first timed block on the Focus screen to build verified progress."
                  action={
                    <Link
                      href="/focus"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Open focus timer
                    </Link>
                  }
                  className="px-5 py-8"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {sessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0"
                    >
                      <span
                        className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          session.isValid
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning"
                        }`}
                      >
                        <Timer className="size-3.5" strokeWidth={1.9} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-ink">
                          {session.taskTitle ?? "Free focus"}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                          {formatDate(
                            session.startedAt,
                            { month: "short", day: "numeric" },
                            timezone,
                          )}{" "}
                          at {formatTime(session.startedAt, timezone)} ·{" "}
                          {formatMinutes(session.actualMinutes)}
                        </p>
                      </div>
                      <Badge tone={session.isValid ? "success" : "warning"}>
                        {session.isValid ? "Valid" : "Below min"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </div>

          <div className="border-t border-line bg-surface-2/40 px-5 py-3.5 text-[11px] text-muted sm:px-6">
            Sessions require at least{" "}
            <span className="font-medium text-ink-soft">
              {formatMinutes(workspace.settings.minValidFocusMinutes)}
            </span>{" "}
            on the server clock to count toward a Must-do task.
          </div>
        </Card>
      </section>
    </div>
  );
}
