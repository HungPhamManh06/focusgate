import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Sparkles,
  Timer,
  TrendingDown,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { BarChart } from "@/components/charts/bar-chart";
import { formatDate, formatMinutes, todayIso } from "@/lib/data/format";
import { getHealthSummary } from "@/lib/data/health";
import { getStatistics } from "@/lib/data/stats";
import { getWorkspace } from "@/lib/data/workspace";
import { cn } from "@/lib/utils";
import { HealthLogCard } from "./health-log-card";

export const dynamic = "force-dynamic";

const periods = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
] as const;

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const requested = Number(params.period);
  const period = periods.some((option) => option.value === requested) ? requested : 7;

  const [workspace, stats] = await Promise.all([getWorkspace(), getStatistics(period)]);
  const { timezone } = workspace.profile;
  const health = await getHealthSummary(period, timezone);

  const activeDays = stats.days.filter((day) => day.focusMinutes > 0).length;
  const averageFocus = Math.round(stats.focusMinutes / stats.periodDays);
  const hasActivity =
    stats.focusMinutes > 0 || stats.tasksCompleted > 0 || stats.entertainmentMinutes > 0;
  const bestLabel = stats.bestDay
    ? formatDate(`${stats.bestDay.date}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" }, "UTC")
    : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Statistics"
        title="Proof, not vibes."
        description="What actually happened to your attention — verified focus, finished work, and the entertainment you paid for."
        actions={
          <>
            <Link href="/focus" className={buttonVariants({ variant: "outline", size: "md" })}>
              <Timer className="size-4" /> Start a session
            </Link>
            <Link href="/wallet" className={buttonVariants({ variant: "ghost", size: "md" })}>
              Wallet
            </Link>
          </>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface p-1 sm:w-fit">
        {periods.map((option) => (
          <Link
            key={option.value}
            href={`/statistics?period=${option.value}`}
            aria-current={period === option.value ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-[12px] font-medium transition-colors",
              period === option.value
                ? "bg-ink text-canvas"
                : "text-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Verified focus"
          value={formatMinutes(stats.focusMinutes)}
          hint={`${stats.sessionCount} sessions · avg ${formatMinutes(averageFocus)}/day`}
          icon={Timer}
          tone="accent"
        />
        <StatCard
          label="Tasks completed"
          value={String(stats.tasksCompleted)}
          hint={
            stats.tasksCompleted + stats.openTasks > 0
              ? `${stats.openTasks} open · ${stats.completionRate}% completion`
              : "No tasks logged in this period"
          }
          icon={CheckCircle2}
          tone={stats.tasksCompleted > 0 ? "success" : "default"}
        />
        <StatCard
          label="Entertainment"
          value={formatMinutes(stats.entertainmentMinutes)}
          hint={
            (stats.blockedAttempts ?? 0) > 0
              ? `${stats.blockedAttempts} blocked attempt${stats.blockedAttempts === 1 ? "" : "s"}`
              : "Paid for with earned minutes"
          }
          icon={TrendingDown}
          tone="warning"
        />
        <StatCard
          label="Valid sessions"
          value={stats.sessionCount > 0 ? `${stats.validRate}%` : "—"}
          hint={
            stats.sessionCount > 0
              ? `${stats.sessionCount - Math.round((stats.sessionCount * stats.validRate) / 100)} below the minimum`
              : "No completed sessions in this period"
          }
          icon={Flame}
        />
      </section>

      {!hasActivity ? (
        <Card className="mt-4">
          <EmptyState
            icon={BarChart3}
            title="No activity in this period"
            description="Focus sessions and completed tasks will create your rhythm here. The first block starts on the Focus screen."
            action={
              <Link href="/focus" className={buttonVariants({ variant: "accent", size: "sm" })}>
                Start focusing
              </Link>
            }
            className="border-0 bg-transparent shadow-none"
          />
        </Card>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Focus rhythm</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    Verified focus minutes per day over the last {stats.periodDays} days.
                  </p>
                </div>
                <span className="font-display text-[26px] leading-none">
                  {formatMinutes(stats.focusMinutes)}
                </span>
              </CardHeader>
              <CardContent className="pt-5">
                <BarChart
                  data={stats.days.map((day) => ({ label: day.label, value: day.focusMinutes }))}
                  tone="accent"
                  height={192}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Consistency</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">Small blocks, repeated.</p>
                </div>
                <CalendarDays className="size-4 text-muted" strokeWidth={1.8} />
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11.5px] text-muted">Active days</p>
                    <p className="text-[12.5px] font-medium">
                      {activeDays}/{stats.periodDays}
                    </p>
                  </div>
                  <Progress
                    value={(activeDays / stats.periodDays) * 100}
                    tone="accent"
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11.5px] text-muted">Valid session rate</p>
                    <p className="text-[12.5px] font-medium">{stats.validRate}%</p>
                  </div>
                  <Progress
                    value={stats.validRate}
                    tone={stats.validRate >= 80 ? "success" : "warning"}
                    className="mt-2"
                  />
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11.5px] text-muted">Task completion</p>
                    <p className="text-[12.5px] font-medium">{stats.completionRate}%</p>
                  </div>
                  <Progress value={stats.completionRate} tone="ink" className="mt-2" />
                </div>

                <dl className="space-y-2.5 border-t border-line pt-4 text-[11.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Best day</dt>
                    <dd className="font-medium">
                      {stats.bestDay && bestLabel
                        ? `${bestLabel} · ${formatMinutes(stats.bestDay.focusMinutes)}`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Average / day</dt>
                    <dd className="font-medium">{formatMinutes(averageFocus)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Sessions</dt>
                    <dd className="font-medium">{stats.sessionCount}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Open tasks</dt>
                    <dd className="font-medium">{stats.openTasks}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Entertainment paid for</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    Logged usage against earned minutes, per day.
                  </p>
                </div>
                <span className="font-display text-[26px] leading-none">
                  {formatMinutes(stats.entertainmentMinutes)}
                </span>
              </CardHeader>
              <CardContent className="pt-5">
                <BarChart
                  data={stats.days.map((day) => ({ label: day.label, value: day.entertainmentMinutes }))}
                  tone="ink"
                  height={140}
                  emptyLabel="No entertainment time logged in this period."
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reading the numbers</CardTitle>
                <Sparkles className="size-4 text-accent" />
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Clock3 className="size-3.5" />
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">Verified focus</span> only counts sessions
                    that meet the minimum length and are tied to real time on the clock.
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                    <CheckCircle2 className="size-3.5" />
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">Completion</span> compares finished tasks
                    with everything still open — not just this period.
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                    <TrendingDown className="size-3.5" />
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">Entertainment</span> is usage logged against
                    the wallet. If it is high, the gate is doing its job honestly.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Discipline streak &amp; activity</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    Current streak: <span className="font-semibold text-ink">{stats.currentStreak ?? 0}d</span> · Best:{" "}
                    <span className="font-semibold text-ink">{stats.bestStreak ?? 0}d</span>
                  </p>
                </div>
                <Flame className="size-4 text-accent" />
              </CardHeader>
              <CardContent className="pt-4">
                <div className="flex flex-wrap gap-1.5">
                  {stats.days.map((day) => {
                    const score = day.focusMinutes + day.tasksCompleted * 15;
                    const tone =
                      score === 0
                        ? "bg-surface-2 border-line"
                        : score < 30
                          ? "bg-accent/25 border-accent/30"
                          : score < 60
                            ? "bg-accent/55 border-accent/60"
                            : "bg-accent border-accent";
                    return (
                      <div
                        key={day.date}
                        title={`${day.label}: ${formatMinutes(day.focusMinutes)} focus · ${day.tasksCompleted} tasks`}
                        className={cn("size-4 rounded-[4px] border", tone)}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Time by category</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    Verified focus &amp; stopwatch minutes grouped by task category.
                  </p>
                </div>
                <Clock3 className="size-4 text-muted" />
              </CardHeader>
              <CardContent className="pt-4">
                {(stats.categoryBreakdown ?? []).length === 0 ? (
                  <p className="text-[12px] text-muted">
                    Complete a Focus or Stopwatch session linked to a task to see time breakdown.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {(stats.categoryBreakdown ?? []).map((item) => {
                      const pct =
                        stats.focusMinutes > 0
                          ? Math.round((item.minutes / stats.focusMinutes) * 100)
                          : 0;
                      return (
                        <div key={item.category}>
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="capitalize font-medium text-ink">
                              {item.category.replace("_", " ")}
                            </span>
                            <span className="tabular-nums text-muted">
                              {formatMinutes(item.minutes)} ({pct}%)
                            </span>
                          </div>
                          <Progress value={pct} className="mt-1 h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="mt-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Peak Focus Hours (24h)</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {stats.peakFocusHour !== null && stats.peakFocusHour !== undefined
                      ? `Your peak focus hour is ${String(stats.peakFocusHour).padStart(2, "0")}:00 – ${String((stats.peakFocusHour + 1) % 24).padStart(2, "0")}:00.`
                      : "Complete focus sessions to discover your peak focus hours."}
                  </p>
                </div>
                <span className="text-[11px] text-muted">
                  Streak Freezes: {stats.streakFreezeCount ?? 0}
                </span>
              </CardHeader>
              <CardContent className="pt-3">
                <div className="grid grid-cols-12 gap-1.5 sm:grid-cols-24">
                  {(stats.hourlyBreakdown ?? []).map((bucket) => {
                    const intensity =
                      bucket.focusMinutes >= 60
                        ? "bg-accent text-white"
                        : bucket.focusMinutes > 0
                          ? "bg-accent/40 text-ink"
                          : bucket.blockedAttempts > 0
                            ? "bg-danger-soft text-danger"
                            : "bg-surface-2 text-muted";
                    return (
                      <div
                        key={bucket.hour}
                        title={`${String(bucket.hour).padStart(2, "0")}:00 · ${bucket.focusMinutes}m focus · ${bucket.blockedAttempts} blocked`}
                        className={`flex flex-col items-center justify-center rounded-md py-1.5 text-[10px] font-medium ${intensity}`}
                      >
                        <span>{String(bucket.hour).padStart(2, "0")}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="mt-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Daily breakdown</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    Focus, finished tasks and paid entertainment.
                  </p>
                </div>
                <BarChart3 className="size-4 text-muted" strokeWidth={1.8} />
              </CardHeader>
              <CardContent className="pt-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-muted">
                        <th className="py-2 pr-3 font-medium">Day</th>
                        <th className="py-2 pr-3 text-right font-medium">Focus</th>
                        <th className="py-2 pr-3 text-right font-medium">Tasks</th>
                        <th className="py-2 text-right font-medium">Entertainment</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...stats.days].reverse().map((day) => (
                        <tr key={day.date} className="border-b border-line/70 last:border-0">
                          <td className="py-2.5 pr-3 text-ink-soft">
                            {formatDate(`${day.date}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" }, "UTC")}
                          </td>
                          <td className="py-2.5 pr-3 text-right font-medium">
                            {day.focusMinutes > 0 ? formatMinutes(day.focusMinutes) : "—"}
                          </td>
                          <td className="py-2.5 pr-3 text-right">{day.tasksCompleted || "—"}</td>
                          <td className="py-2.5 text-right">
                            {day.entertainmentMinutes > 0 ? formatMinutes(day.entertainmentMinutes) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <section className="mt-4">
        <HealthLogCard health={health} todayDate={todayIso(timezone)} />
      </section>

      <p className="mt-6 text-[10.5px] text-muted">
        Time zone: {timezone} · periods include today. “Valid” means the backend verified the session.
      </p>
    </div>
  );
}
