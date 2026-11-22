import Link from "next/link";
import { ArrowRight, ListTodo, Target, Timer } from "lucide-react";
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
import {
  filterDueSoonTasks,
  formatPlanProgressStat,
} from "@/lib/domain/dashboard-state";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch 5 upcoming tasks with due dates so that if 1 is promoted to "Your Next Move",
  // "Due Soon" can still display up to 4 distinct remaining deadlines.
  const [workspace, plan, focus, wallet, upcomingRaw, sessions, counts] = await Promise.all([
    getWorkspace(),
    getTodayPlan(),
    getTodayFocusSummary(),
    getWallet(),
    getUpcomingTasks(5),
    getRecentSessions(4),
    getTaskCounts(),
  ]);

  const nextMove = await getNextMoveCandidate(plan);
  const dueSoonTasks = filterDueSoonTasks(upcomingRaw, nextMove?.task.id, 4);

  const { timezone, displayName } = workspace.profile;
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(new Date());

  const todayGrant = plan
    ? wallet.grants.find(
        (grant) => grant.dailyPlanId === plan.id && grant.source === "daily_plan_base",
      )
    : undefined;

  const planStat = formatPlanProgressStat(plan);
  const otherOpenCount = Math.max(0, counts.open - counts.mustDoOpen);

  return (
    <div className="mx-auto w-full max-w-[1280px] overflow-x-hidden px-4 py-7 sm:px-8 sm:py-9 lg:px-10">
      {/* 1. Greeting Header — Clean editorial greeting without competing duplicate CTAs */}
      <PageHeader
        eyebrow={dateLabel}
        title={`${greeting(timezone)}, ${firstName}.`}
        description="Make today count. Finish what matters, focus deeply, and earn your time."
      />

      {/* 2. Daily Overview — 3 focused stat cards */}
      <section
        className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Daily overview"
      >
        <StatCard
          label="Focus today"
          value={formatMinutes(focus.minutes)}
          hint={
            plan && plan.progress.focusRequired > 0
              ? `${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} · ${formatMinutes(plan.progress.focusDone)} of ${formatMinutes(plan.progress.focusRequired)} target`
              : focus.sessions > 0
                ? `${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} of ${focus.sessions} today`
                : "No focus sessions logged today · target not set"
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
            value={counts.open > 0 ? String(counts.open) : "No open tasks"}
            hint={
              counts.open > 0
                ? `${counts.mustDoOpen} must-do · ${otherOpenCount} should-do & bonus →`
                : "Your task queue is empty · add a task →"
            }
            icon={ListTodo}
            className="flex h-full flex-col justify-between transition-colors group-hover:border-ink/25"
          />
        </Link>

        <StatCard
          label="Plan progress"
          value={planStat.value}
          hint={planStat.hint}
          icon={Target}
          tone={planStat.tone}
          className="flex h-full flex-col justify-between sm:col-span-2 lg:col-span-1"
        />
      </section>

      {/* 3. Main Content — Today's Mission (~66%) + Reward Wallet (~34%) */}
      <section
        className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1.95fr)_minmax(340px,1fr)]"
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
        className="mt-6 grid items-start gap-5 lg:grid-cols-2"
        aria-label="Next move, upcoming deadlines, and recent focus"
      >
        <div className="space-y-5">
          <NextMoveCard
            suggestion={nextMove}
            hasPlan={Boolean(plan)}
            totalTasksCount={counts.total}
            completedTasksCount={counts.completed}
            timezone={timezone}
          />

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Due soon</CardTitle>
                <p className="mt-1 text-[13px] text-ink-soft">
                  Other upcoming deadlines in your open work queue.
                </p>
              </div>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
              >
                View all tasks <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {dueSoonTasks.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="Nothing due soon."
                  description="You have no other outstanding tasks with an approaching deadline."
                  className="px-5 py-7"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {dueSoonTasks.map((task) => {
                    const due = relativeDue(task.dueDate, timezone);
                    const overdue = due?.includes("overdue") ?? false;
                    return (
                      <li
                        key={task.id}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[14px] font-medium text-ink">
                              {task.title}
                            </p>
                            {overdue ? <Badge tone="danger">Overdue</Badge> : null}
                          </div>
                          <p className="mt-1 text-[12.5px] text-ink-soft tabular-nums">
                            <span className={overdue ? "font-semibold text-danger" : "font-medium"}>
                              {due ?? formatDate(task.dueDate, undefined, timezone)}
                            </span>{" "}
                            <span className="text-muted">·</span> {formatMinutes(task.estimatedMinutes)} est.
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
                <p className="mt-1 text-[13px] text-ink-soft">
                  Your last verified and logged focus blocks.
                </p>
              </div>
              <Link
                href="/statistics"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
              >
                Statistics <ArrowRight className="size-3.5" />
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
                        <p className="truncate text-[14px] font-medium text-ink">
                          {session.taskTitle ?? "Free focus"}
                        </p>
                        <p className="mt-0.5 text-[12.5px] text-ink-soft tabular-nums">
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

          <div className="border-t border-line bg-surface-2/40 px-5 py-3.5 text-[12px] text-ink-soft sm:px-6">
            Sessions require at least{" "}
            <span className="font-semibold text-ink">
              {formatMinutes(workspace.settings.minValidFocusMinutes)}
            </span>{" "}
            on the server clock to count toward a Must-do task.
          </div>
        </Card>
      </section>
    </div>
  );
}
