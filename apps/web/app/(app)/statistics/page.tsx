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
import { getCategoryLabel } from "@/components/domain/labels";
import { DailyReceiptCard } from "@/components/domain/daily-receipt-card";
import { DistractionSleepCard } from "@/components/domain/distraction-sleep-card";
import { FocusPassportCard } from "@/components/domain/focus-passport-card";
import { WeeklyReviewCard } from "@/components/domain/weekly-review-modal";
import { buildDailySeals } from "@/lib/domain/focus-passport";
import { getWeeklyReviewContext } from "@/lib/data/v4-ecosystem";
import { BarChart } from "@/components/charts/bar-chart";
import { formatDate, formatMinutes, todayIso } from "@/lib/data/format";
import { getHealthSummary } from "@/lib/data/health";
import { getStatistics } from "@/lib/data/stats";
import { getV2Settings } from "@/lib/data/v2-settings";
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

  const [workspace, v2Settings] = await Promise.all([
    getWorkspace(),
    getV2Settings().catch(() => null),
  ]);
  const locale = v2Settings?.language ?? "en";
  const isVi = locale === "vi";
  const stats = await getStatistics(period, locale);
  const { timezone } = workspace.profile;
  const health = await getHealthSummary(period, timezone);
  const weeklyReview = await getWeeklyReviewContext().catch(() => null);
  const passportSummary = buildDailySeals(stats.days, health.days);

  const activeDays = stats.days.filter((day) => day.focusMinutes > 0).length;
  const averageFocus = Math.round(stats.focusMinutes / stats.periodDays);
  const hasActivity =
    stats.focusMinutes > 0 || stats.tasksCompleted > 0 || stats.entertainmentMinutes > 0;
  const bestLabel = stats.bestDay
    ? formatDate(`${stats.bestDay.date}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" }, "UTC", locale)
    : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={isVi ? "Thống kê" : "Statistics"}
        title={isVi ? "Số liệu thực tế, không cảm tính." : "Proof, not vibes."}
        description={
          isVi
            ? "Điều gì thực sự đã diễn ra với sự tập trung của bạn — phiên hợp lệ, việc đã xong và thời gian giải trí đã dùng."
            : "What actually happened to your attention — verified focus, finished work, and the entertainment you paid for."
        }
        actions={
          <>
            <Link href="/focus" className={buttonVariants({ variant: "outline", size: "md" })}>
              <Timer className="size-4" /> {isVi ? "Bắt đầu phiên" : "Start a session"}
            </Link>
            <Link href="/wallet" className={buttonVariants({ variant: "ghost", size: "md" })}>
              {isVi ? "Ví thưởng" : "Wallet"}
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
            {isVi ? `${option.value} ngày` : option.label}
          </Link>
        ))}
      </div>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={isVi ? "Tập trung hợp lệ" : "Verified focus"}
          value={formatMinutes(stats.focusMinutes)}
          hint={
            isVi
              ? `${stats.sessionCount} phiên · TB ${formatMinutes(averageFocus)}/ngày`
              : `${stats.sessionCount} sessions · avg ${formatMinutes(averageFocus)}/day`
          }
          icon={Timer}
          tone="accent"
        />
        <StatCard
          label={isVi ? "Nhiệm vụ hoàn thành" : "Tasks completed"}
          value={String(stats.tasksCompleted)}
          hint={
            stats.tasksCompleted + stats.openTasks > 0
              ? isVi
                ? `${stats.openTasks} đang mở · hoàn thành ${stats.completionRate}%`
                : `${stats.openTasks} open · ${stats.completionRate}% completion`
              : isVi
                ? "Chưa có nhiệm vụ nào trong kỳ này"
                : "No tasks logged in this period"
          }
          icon={CheckCircle2}
          tone={stats.tasksCompleted > 0 ? "success" : "default"}
        />
        <StatCard
          label={isVi ? "Giải trí" : "Entertainment"}
          value={formatMinutes(stats.entertainmentMinutes)}
          hint={
            (stats.blockedAttempts ?? 0) > 0
              ? isVi
                ? `${stats.blockedAttempts} lần bị chặn`
                : `${stats.blockedAttempts} blocked attempt${stats.blockedAttempts === 1 ? "" : "s"}`
              : isVi
                ? "Đổi bằng phút thưởng đã kiếm"
                : "Paid for with earned minutes"
          }
          icon={TrendingDown}
          tone="warning"
        />
        <StatCard
          label={isVi ? "Phiên hợp lệ" : "Valid sessions"}
          value={stats.sessionCount > 0 ? `${stats.validRate}%` : "—"}
          hint={
            stats.sessionCount > 0
              ? isVi
                ? `${stats.sessionCount - Math.round((stats.sessionCount * stats.validRate) / 100)} phiên dưới ngưỡng tối thiểu`
                : `${stats.sessionCount - Math.round((stats.sessionCount * stats.validRate) / 100)} below the minimum`
              : isVi
                ? "Chưa có phiên nào trong kỳ này"
                : "No completed sessions in this period"
          }
          icon={Flame}
        />
      </section>

      <FocusPassportCard
        statsDays={stats.days}
        healthDays={health.days}
        locale={locale}
      />

      <DailyReceiptCard
        displayName={workspace.profile.displayName}
        periodDays={stats.periodDays}
        focusMinutes={stats.focusMinutes}
        tasksCompleted={stats.tasksCompleted}
        goldSeals={passportSummary.goldCount}
        currentStreak={passportSummary.currentStreak}
        avgSleepMinutes={health.avgSleepMinutes}
        avgSteps={health.avgSteps}
        locale={locale}
      />

      {!hasActivity ? (
        <Card className="mt-4">
          <EmptyState
            icon={BarChart3}
            title={isVi ? "Chưa có hoạt động trong kỳ này" : "No activity in this period"}
            description={
              isVi
                ? "Các phiên tập trung và nhiệm vụ hoàn thành sẽ tạo nên nhịp độ của bạn tại đây."
                : "Focus sessions and completed tasks will create your rhythm here. The first block starts on the Focus screen."
            }
            action={
              <Link href="/focus" className={buttonVariants({ variant: "accent", size: "sm" })}>
                {isVi ? "Bắt đầu tập trung" : "Start focusing"}
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
                  <CardTitle>{isVi ? "Nhịp độ tập trung" : "Focus rhythm"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {isVi
                      ? `Số phút tập trung hợp lệ mỗi ngày trong ${stats.periodDays} ngày qua.`
                      : `Verified focus minutes per day over the last ${stats.periodDays} days.`}
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
                  <CardTitle>{isVi ? "Sự đều đặn" : "Consistency"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {isVi ? "Những phiên nhỏ, lặp lại đều đặn." : "Small blocks, repeated."}
                  </p>
                </div>
                <CalendarDays className="size-4 text-muted" strokeWidth={1.8} />
              </CardHeader>
              <CardContent className="space-y-5 pt-5">
                <div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11.5px] text-muted">
                      {isVi ? "Số ngày hoạt động" : "Active days"}
                    </p>
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
                    <p className="text-[11.5px] text-muted">
                      {isVi ? "Tỉ lệ phiên hợp lệ" : "Valid session rate"}
                    </p>
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
                    <p className="text-[11.5px] text-muted">
                      {isVi ? "Hoàn thành nhiệm vụ" : "Task completion"}
                    </p>
                    <p className="text-[12.5px] font-medium">{stats.completionRate}%</p>
                  </div>
                  <Progress value={stats.completionRate} tone="ink" className="mt-2" />
                </div>

                <dl className="space-y-2.5 border-t border-line pt-4 text-[11.5px]">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">{isVi ? "Ngày tốt nhất" : "Best day"}</dt>
                    <dd className="font-medium">
                      {stats.bestDay && bestLabel
                        ? `${bestLabel} · ${formatMinutes(stats.bestDay.focusMinutes)}`
                        : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">{isVi ? "Trung bình / ngày" : "Average / day"}</dt>
                    <dd className="font-medium">{formatMinutes(averageFocus)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">{isVi ? "Số phiên" : "Sessions"}</dt>
                    <dd className="font-medium">{stats.sessionCount}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">{isVi ? "Việc đang mở" : "Open tasks"}</dt>
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
                  <CardTitle>{isVi ? "Thời gian giải trí đã dùng" : "Entertainment paid for"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {isVi
                      ? "Thời gian giải trí đã ghi nhận theo từng ngày."
                      : "Logged usage against earned minutes, per day."}
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
                  emptyLabel={
                    isVi
                      ? "Chưa có thời gian giải trí nào được ghi nhận."
                      : "No entertainment time logged in this period."
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isVi ? "Cách đọc số liệu" : "Reading the numbers"}</CardTitle>
                <Sparkles className="size-4 text-accent" />
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <Clock3 className="size-3.5" />
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">
                      {isVi ? "Tập trung hợp lệ" : "Verified focus"}
                    </span>{" "}
                    {isVi
                      ? "chỉ tính các phiên đạt thời lượng tối thiểu theo đồng hồ máy chủ."
                      : "only counts sessions that meet the minimum length and are tied to real time on the clock."}
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-success-soft text-success">
                    <CheckCircle2 className="size-3.5" />
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">
                      {isVi ? "Hoàn thành" : "Completion"}
                    </span>{" "}
                    {isVi
                      ? "so sánh số việc đã xong với toàn bộ việc đang mở."
                      : "compares finished tasks with everything still open — not just this period."}
                  </p>
                </div>
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
                    <TrendingDown className="size-3.5" />
                  </span>
                  <p className="text-[11.5px] leading-relaxed text-muted">
                    <span className="font-medium text-ink">
                      {isVi ? "Giải trí" : "Entertainment"}
                    </span>{" "}
                    {isVi
                      ? "là thời gian bạn đã đổi từ ví thưởng."
                      : "is usage logged against the wallet. If it is high, the gate is doing its job honestly."}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <section className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{isVi ? "Chuỗi kỷ luật & Hoạt động" : "Discipline streak & activity"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {isVi ? "Chuỗi hiện tại:" : "Current streak:"}{" "}
                    <span className="font-semibold text-ink">{stats.currentStreak ?? 0}d</span> ·{" "}
                    {isVi ? "Tốt nhất:" : "Best:"}{" "}
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
                  <CardTitle>{isVi ? "Thời gian theo danh mục" : "Time by category"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {isVi
                      ? "Phút tập trung & bấm giờ được nhóm theo danh mục nhiệm vụ."
                      : "Verified focus & stopwatch minutes grouped by task category."}
                  </p>
                </div>
                <Clock3 className="size-4 text-muted" />
              </CardHeader>
              <CardContent className="pt-4">
                {(stats.categoryBreakdown ?? []).length === 0 ? (
                  <p className="text-[12px] text-muted">
                    {isVi
                      ? "Hoàn thành phiên Tập trung hoặc Bấm giờ gắn với nhiệm vụ để xem phân bổ."
                      : "Complete a Focus or Stopwatch session linked to a task to see time breakdown."}
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
                            <span className="font-medium text-ink">
                              {item.category === "free_focus"
                                ? isVi ? "Tập trung tự do" : "Free focus"
                                : getCategoryLabel(item.category, locale)}
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
                  <CardTitle>{isVi ? "Khung giờ tập trung cao điểm (24h)" : "Peak Focus Hours (24h)"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {stats.peakFocusHour !== null && stats.peakFocusHour !== undefined
                      ? isVi
                        ? `Khung giờ tập trung cao điểm của bạn là ${String(stats.peakFocusHour).padStart(2, "0")}:00 – ${String((stats.peakFocusHour + 1) % 24).padStart(2, "0")}:00.`
                        : `Your peak focus hour is ${String(stats.peakFocusHour).padStart(2, "0")}:00 – ${String((stats.peakFocusHour + 1) % 24).padStart(2, "0")}:00.`
                      : isVi
                        ? "Hoàn thành các phiên tập trung để khám phá khung giờ vàng của bạn."
                        : "Complete focus sessions to discover your peak focus hours."}
                  </p>
                </div>
                <span className="text-[11px] text-muted">
                  {isVi ? "Đóng băng chuỗi:" : "Streak Freezes:"} {stats.streakFreezeCount ?? 0}
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
                        title={`${String(bucket.hour).padStart(2, "0")}:00 · ${bucket.focusMinutes}m · ${bucket.blockedAttempts} ${isVi ? "bị chặn" : "blocked"}`}
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
                  <CardTitle>{isVi ? "Chi tiết theo ngày" : "Daily breakdown"}</CardTitle>
                  <p className="mt-1 text-[12px] text-muted">
                    {isVi
                      ? "Tập trung, nhiệm vụ hoàn thành và giải trí đã dùng."
                      : "Focus, finished tasks and paid entertainment."}
                  </p>
                </div>
                <BarChart3 className="size-4 text-muted" strokeWidth={1.8} />
              </CardHeader>
              <CardContent className="pt-3">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-left text-[11.5px]">
                    <thead>
                      <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-muted">
                        <th className="py-2 pr-3 font-medium">{isVi ? "Ngày" : "Day"}</th>
                        <th className="py-2 pr-3 text-right font-medium">{isVi ? "Tập trung" : "Focus"}</th>
                        <th className="py-2 pr-3 text-right font-medium">{isVi ? "Nhiệm vụ" : "Tasks"}</th>
                        <th className="py-2 text-right font-medium">{isVi ? "Giải trí" : "Entertainment"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...stats.days].reverse().map((day) => (
                        <tr key={day.date} className="border-b border-line/70 last:border-0">
                          <td className="py-2.5 pr-3 text-ink-soft">
                            {formatDate(`${day.date}T12:00:00Z`, { weekday: "short", day: "numeric", month: "short" }, "UTC", locale)}
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
        <HealthLogCard
          health={health}
          todayDate={todayIso(timezone)}
          focusDays={stats.days.map((d) => ({ date: d.date, focusMinutes: d.focusMinutes }))}
        />
      </section>

      <DistractionSleepCard
        days={stats.days}
        healthDays={health.days}
        hourlyFocus={stats.hourlyBreakdown ?? []}
        blockedAttempts={stats.blockedAttempts ?? 0}
      />

      {weeklyReview && (
        <WeeklyReviewCard
          weekStart={weeklyReview.weekStart}
          latestReview={weeklyReview.latestReview}
          completedThisWeek={weeklyReview.completedThisWeek}
          staleBacklog={weeklyReview.staleBacklog}
        />
      )}

      <p className="mt-6 text-[10.5px] text-muted">
        {isVi
          ? `Múi giờ: ${timezone} · các kỳ bao gồm hôm nay. “Hợp lệ” nghĩa là máy chủ đã xác thực phiên.`
          : `Time zone: ${timezone} · periods include today. “Valid” means the backend verified the session.`}
      </p>
    </div>
  );
}
