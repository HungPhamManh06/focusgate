import Link from "next/link";
import { ArrowRight, ListTodo, Target, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { AiCoachCard } from "@/components/domain/ai-coach-card";
import { DailyMissionCard } from "@/components/domain/daily-mission-card";
import { OnboardingTourModal } from "@/components/domain/onboarding-tour-modal";
import { getStalledTasks } from "@/lib/data/v4-ecosystem";
import { getStatistics } from "@/lib/data/stats";
import { getHealthSummary } from "@/lib/data/health";
import { generateWeeklyCoachInsights } from "@/lib/domain/focus-coach";
import { KindBadge } from "@/components/domain/labels";
import { LiveGreetingHeader } from "@/components/domain/live-greeting-header";
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
import { getV2Settings } from "@/lib/data/v2-settings";
import { getWorkspace } from "@/lib/data/workspace";
import {
  filterDueSoonTasks,
  formatOpenTasksStat,
  formatPlanProgressStat,
} from "@/lib/domain/dashboard-state";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  // Fetch 5 upcoming tasks with due dates so that if 1 is promoted to "Your Next Move",
  // "Due Soon" can still display up to 4 distinct remaining deadlines.
  const [workspace, plan, focus, wallet, upcomingRaw, sessions, counts, v2Settings, stalledTasks] = await Promise.all([
    getWorkspace(),
    getTodayPlan(),
    getTodayFocusSummary(),
    getWallet(),
    getUpcomingTasks(5),
    getRecentSessions(4),
    getTaskCounts(),
    getV2Settings().catch(() => null),
    getStalledTasks().catch(() => []),
  ]);

  const locale = v2Settings?.language ?? "en";
  const isVi = locale === "vi";

  const [weeklyStats, weeklyHealth] = await Promise.all([
    getStatistics(7, locale).catch(() => null),
    getHealthSummary(7, workspace.profile.timezone).catch(() => null),
  ]);
  const coachInsights = weeklyStats
    ? generateWeeklyCoachInsights({
        days: weeklyStats.days,
        healthDays: weeklyHealth?.days ?? [],
        hourlyFocus: weeklyStats.hourlyBreakdown ?? [],
        blockedAttempts: weeklyStats.blockedAttempts ?? 0,
        completionRate: weeklyStats.completionRate,
      })
    : [];

  const nextMove = await getNextMoveCandidate(plan);
  const dueSoonTasks = filterDueSoonTasks(upcomingRaw, nextMove?.task.id, 4);

  const { timezone, displayName } = workspace.profile;
  const firstName = displayName.split(/\s+/)[0] ?? displayName;
  const dateLabel = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-GB", {
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

  const planStat = formatPlanProgressStat(plan, locale);
  const openTasksStat = formatOpenTasksStat(counts, locale);

  return (
    <div className="mx-auto w-full max-w-[1280px] overflow-x-hidden px-4 py-7 sm:px-8 sm:py-9 lg:px-10">
      {/* 1. Greeting Header — Live local-time greeting without hydration mismatch */}
      <LiveGreetingHeader
        firstName={firstName}
        initialDateLabel={dateLabel}
        initialGreeting={greeting(timezone, locale)}
        description={
          isVi
            ? "Biến hôm nay thành một ngày ý nghĩa. Hoàn thành việc quan trọng, tập trung sâu và nhận phần thưởng của bạn."
            : "Make today count. Finish what matters, focus deeply, and earn your time."
        }
      />

      {/* 2. Daily Overview — 3 focused stat cards */}
      <section
        className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-label={isVi ? "Tổng quan hôm nay" : "Daily overview"}
      >
        <StatCard
          label={isVi ? "Tập trung hôm nay" : "Focus today"}
          value={formatMinutes(focus.minutes)}
          hint={
            plan && plan.progress.focusRequired > 0
              ? isVi
                ? `${focus.validSessions} phiên hợp lệ · ${formatMinutes(plan.progress.focusDone)} / ${formatMinutes(plan.progress.focusRequired)} mục tiêu`
                : `${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} · ${formatMinutes(plan.progress.focusDone)} of ${formatMinutes(plan.progress.focusRequired)} target`
              : focus.sessions > 0
                ? isVi
                  ? `${focus.validSessions} phiên hợp lệ trên tổng ${focus.sessions} hôm nay`
                  : `${focus.validSessions} valid session${focus.validSessions === 1 ? "" : "s"} of ${focus.sessions} today`
                : isVi
                  ? "Chưa có phiên tập trung nào hôm nay · chưa đặt mục tiêu"
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
            label={isVi ? "Nhiệm vụ đang mở" : "Open tasks"}
            value={openTasksStat.value}
            hint={openTasksStat.hint}
            icon={ListTodo}
            className="flex h-full flex-col justify-between transition-colors group-hover:border-ink/25"
          />
        </Link>

        <StatCard
          label={isVi ? "Tiến độ kế hoạch" : "Plan progress"}
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
        aria-label={isVi ? "Nhiệm vụ hôm nay và ví thưởng" : "Today's mission and reward wallet"}
      >
        <DailyMissionCard
          plan={plan}
          settings={workspace.settings}
          todayGrant={todayGrant}
          latestSession={sessions[0]}
          timezone={timezone}
          locale={locale}
        />

        <RewardWalletCard wallet={wallet} timezone={timezone} locale={locale} />
      </section>

      {/* 4. Supporting Information — Left: Your Next Move + Due Soon | Right: Recent Focus (stretches on desktop) */}
      <section
        className="mt-6 grid gap-5 lg:grid-cols-2 lg:items-stretch"
        aria-label={isVi ? "Bước tiếp theo, hạn sắp tới và tập trung gần đây" : "Next move, upcoming deadlines, and recent focus"}
      >
        <div className="flex flex-col gap-5">
          <NextMoveCard
            suggestion={nextMove}
            hasPlan={Boolean(plan)}
            totalTasksCount={counts.total}
            completedTasksCount={counts.completed}
            timezone={timezone}
            locale={locale}
          />

          <Card className="flex-1">
            <CardHeader>
              <div>
                <CardTitle>{isVi ? "Sắp đến hạn" : "Due soon"}</CardTitle>
                <p className="mt-1 text-[13px] text-ink-soft">
                  {isVi
                    ? "Các hạn chót sắp tới khác trong hàng chờ của bạn."
                    : "Other upcoming deadlines in your open work queue."}
                </p>
              </div>
              <Link
                href="/tasks"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
              >
                {isVi ? "Xem tất cả nhiệm vụ" : "View all tasks"} <ArrowRight className="size-3.5" />
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {dueSoonTasks.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title={isVi ? "Không có việc nào sắp đến hạn." : "Nothing due soon."}
                  description={
                    isVi
                      ? "Bạn không có nhiệm vụ tồn đọng nào sắp đến hạn."
                      : "You have no other outstanding tasks with an approaching deadline."
                  }
                  className="px-5 py-7"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {dueSoonTasks.map((task) => {
                    const due = relativeDue(task.dueDate, timezone, locale);
                    const overdue = due ? (due.includes("overdue") || due.includes("Quá hạn")) : false;
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
                            {overdue ? (
                              <Badge tone="danger">{isVi ? "Quá hạn" : "Overdue"}</Badge>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[12.5px] text-ink-soft tabular-nums">
                            <span className={overdue ? "font-semibold text-danger" : "font-medium"}>
                              {due ?? formatDate(task.dueDate, undefined, timezone, locale)}
                            </span>{" "}
                            <span className="text-muted">·</span>{" "}
                            {isVi
                              ? `ước tính ${formatMinutes(task.estimatedMinutes)}`
                              : `${formatMinutes(task.estimatedMinutes)} est.`}
                          </p>
                        </div>
                        <KindBadge kind={task.kind} locale={locale} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="flex flex-col lg:h-full">
          <CardHeader>
            <div>
              <CardTitle>{isVi ? "Tập trung gần đây" : "Recent focus"}</CardTitle>
              <p className="mt-1 text-[13px] text-ink-soft">
                {isVi
                  ? "Các phiên tập trung gần nhất đã được xác thực."
                  : "Your last verified and logged focus blocks."}
              </p>
            </div>
            <Link
              href="/statistics"
              className="inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline"
            >
              {isVi ? "Thống kê" : "Statistics"} <ArrowRight className="size-3.5" />
            </Link>
          </CardHeader>

          <CardContent className="flex-1 pt-4">
            {sessions.length === 0 ? (
              <EmptyState
                icon={Timer}
                title={isVi ? "Chưa có phiên tập trung nào" : "No focus sessions yet"}
                description={
                  isVi
                    ? "Bắt đầu phiên bấm giờ đầu tiên ở màn hình Tập trung để tích lũy tiến độ."
                    : "Start your first timed block on the Focus screen to build verified progress."
                }
                action={
                  <Link
                    href="/focus"
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    {isVi ? "Mở đồng hồ tập trung" : "Open focus timer"}
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
                        {session.taskTitle ?? (isVi ? "Tập trung tự do" : "Free focus")}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-ink-soft tabular-nums">
                        {formatDate(
                          session.startedAt,
                          { month: "short", day: "numeric" },
                          timezone,
                          locale,
                        )}{" "}
                        {isVi ? "lúc" : "at"} {formatTime(session.startedAt, timezone)} ·{" "}
                        {formatMinutes(session.isValid ? session.creditedMinutes : session.actualMinutes)}
                        {session.isValid && session.creditedMinutes < session.actualMinutes
                          ? isVi
                            ? ` được tính (${formatMinutes(session.actualMinutes)} thực tế)`
                            : ` credited (${formatMinutes(session.actualMinutes)} elapsed)`
                          : ""}
                      </p>
                    </div>
                    <Badge tone={session.isValid ? "success" : "warning"}>
                      {session.isValid
                        ? isVi ? "Hợp lệ" : "Valid"
                        : isVi ? "Dưới mức tối thiểu" : "Below min"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>

          <div className="mt-auto border-t border-line bg-surface-2/40 px-5 py-3.5 text-[12px] text-ink-soft sm:px-6">
            {isVi ? (
              <>
                Mỗi phiên cần tối thiểu{" "}
                <span className="font-semibold text-ink">
                  {formatMinutes(workspace.settings.minValidFocusMinutes)}
                </span>{" "}
                theo đồng hồ máy chủ để được tính cho nhiệm vụ Bắt buộc.
              </>
            ) : (
              <>
                Sessions require at least{" "}
                <span className="font-semibold text-ink">
                  {formatMinutes(workspace.settings.minValidFocusMinutes)}
                </span>{" "}
                on the server clock to count toward a Must-do task.
              </>
            )}
          </div>
        </Card>
      </section>

      {/* AI Focus Coach */}
      <section className="mt-6">
        <AiCoachCard stalledTasks={stalledTasks} insights={coachInsights} />
      </section>

      <OnboardingTourModal initiallyOpen={v2Settings !== null && !v2Settings.onboardingCompleted} />
    </div>
  );
}
