import Link from "next/link";
import { ListTodo, Target, Timer } from "lucide-react";
import { AiCoachCard } from "@/components/domain/ai-coach-card";
import { DailyMissionCard } from "@/components/domain/daily-mission-card";
import { DashboardActivityTabs } from "@/components/domain/dashboard-activity-tabs";
import { DayTimelineRibbon } from "@/components/domain/day-timeline-ribbon";
import { EnergyCheckinPill } from "@/components/domain/energy-checkin-pill";
import { EveningWrapupTrigger } from "@/components/domain/evening-wrapup-modal";
import { GettingStartedStrip } from "@/components/domain/getting-started-strip";
import { LiveGreetingHeader } from "@/components/domain/live-greeting-header";
import { MorningRitualBanner } from "@/components/domain/morning-ritual-banner";
import { NextMoveCard } from "@/components/domain/next-move-card";
import { OneThingSpotlight } from "@/components/domain/one-thing-spotlight";
import { OnboardingTourModal } from "@/components/domain/onboarding-tour-modal";
import { RewardWalletCard } from "@/components/domain/reward-wallet-card";
import { TodaysWinsStrip } from "@/components/domain/todays-wins-strip";
import { WeeklyPeekStrip } from "@/components/domain/weekly-peek-strip";
import { getNextMoveCandidate, getUpcomingTasks } from "@/lib/data/dashboard";
import { formatMinutes, greeting, todayIso } from "@/lib/data/format";
import { getActiveSession, getRecentSessions, getTodayFocusSummary } from "@/lib/data/focus";
import { getHealthSummary } from "@/lib/data/health";
import { getTodayPlan } from "@/lib/data/planner";
import { getWallet } from "@/lib/data/rewards";
import { getStatistics } from "@/lib/data/stats";
import { getTaskCounts } from "@/lib/data/tasks";
import { getV2Settings } from "@/lib/data/v2-settings";
import { listPlanSchedules } from "@/lib/data/v3-features";
import { getStalledTasks } from "@/lib/data/v4-ecosystem";
import { fetchTodayCalendarEvents } from "@/lib/data/v5-ecosystem";
import { getWorkspace } from "@/lib/data/workspace";
import {
  filterDueSoonTasks,
  formatOpenTasksStat,
  formatPlanProgressStat,
} from "@/lib/domain/dashboard-state";
import { generateWeeklyCoachInsights } from "@/lib/domain/focus-coach";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    workspace,
    plan,
    focus,
    wallet,
    upcomingRaw,
    sessions,
    activeSession,
    counts,
    v2Settings,
    stalledTasks,
  ] = await Promise.all([
    getWorkspace(),
    getTodayPlan(),
    getTodayFocusSummary(),
    getWallet(),
    getUpcomingTasks(5),
    getRecentSessions(5),
    getActiveSession().catch(() => null),
    getTaskCounts(),
    getV2Settings().catch(() => null),
    getStalledTasks().catch(() => []),
  ]);

  const locale = v2Settings?.language ?? "en";
  const isVi = locale === "vi";
  const { timezone, displayName } = workspace.profile;
  const today = todayIso(timezone);

  const [nextMove, schedules, busyEvents, weeklyStats, weeklyHealth] = await Promise.all([
    getNextMoveCandidate(plan),
    listPlanSchedules(plan?.id ?? null).catch(() => []),
    fetchTodayCalendarEvents(v2Settings?.calendarIcsUrl, today).catch(() => []),
    getStatistics(7, locale).catch(() => null),
    getHealthSummary(7, timezone).catch(() => null),
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

  const dueSoonTasks = filterDueSoonTasks(upcomingRaw, nextMove?.task.id, 5);
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
    <div className="mx-auto w-full max-w-[1280px] overflow-x-hidden px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
      {/* 1. Greeting Header + Compact Metric Strip */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2.5">
          <LiveGreetingHeader
            firstName={firstName}
            initialDateLabel={dateLabel}
            initialGreeting={greeting(timezone, locale)}
            description={
              isVi
                ? "Hoàn thành việc quan trọng ngay tại đây, tập trung sâu và mở khóa thời gian tự do."
                : "Finish what matters right here, focus deeply, and unlock guilt-free freedom."
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <OneThingSpotlight
              taskId={nextMove?.task.id ?? null}
              taskTitle={nextMove?.task.title ?? null}
              estimatedMinutes={nextMove?.task.estimatedMinutes}
            />
            <EveningWrapupTrigger
              focusMinutes={focus.minutes}
              completedCount={(plan?.tasks ?? []).filter((t) => Boolean(t.completedAt)).length}
              earnedMinutes={wallet.availableMinutes}
              remainingTasks={(plan?.tasks ?? []).filter((t) => !t.completedAt)}
            />
          </div>
        </div>

        <div
          className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-surface p-2 sm:w-auto sm:min-w-[390px]"
          aria-label={isVi ? "Chỉ số nhanh hôm nay" : "Quick metrics"}
        >
          <Link
            href="/focus"
            className="rounded-xl px-3 py-2 transition-colors hover:bg-surface-2/70"
          >
            <p className="flex items-center gap-1 text-[10.5px] font-medium text-muted">
              <Timer className="size-3 text-accent" /> {isVi ? "Tập trung" : "Focus"}
            </p>
            <p className="mt-0.5 text-[16px] font-bold text-ink tabular-nums">
              {formatMinutes(focus.minutes)}
            </p>
          </Link>
          <Link
            href="/tasks"
            className="rounded-xl border-x border-line/70 px-3 py-2 transition-colors hover:bg-surface-2/70"
          >
            <p className="flex items-center gap-1 text-[10.5px] font-medium text-muted">
              <ListTodo className="size-3 text-accent" /> {isVi ? "Việc mở" : "Open"}
            </p>
            <p className="mt-0.5 text-[16px] font-bold text-ink tabular-nums">
              {openTasksStat.value}
            </p>
          </Link>
          <Link
            href="/planner"
            className="rounded-xl px-3 py-2 transition-colors hover:bg-surface-2/70"
          >
            <p className="flex items-center gap-1 text-[10.5px] font-medium text-muted">
              <Target className="size-3 text-accent" /> {isVi ? "Tiến độ" : "Plan"}
            </p>
            <p className="mt-0.5 text-[16px] font-bold text-ink tabular-nums">
              {planStat.value}
            </p>
          </Link>
        </div>
      </div>

      {/* 2. Live Focus Banner & Day-Progress Timeline Ribbon (08:00 -> 22:00) */}
      <GettingStartedStrip
        hasTasks={counts.total > 0}
        hasPlan={Boolean(plan)}
        hasSessions={sessions.length > 0 || focus.minutes > 0}
      />
      {!plan ? <MorningRitualBanner suggestedTasks={upcomingRaw} /> : null}
      <TodaysWinsStrip
        completedTitles={(plan?.tasks ?? []).filter((t) => Boolean(t.completedAt)).map((t) => t.title)}
        locale={locale}
      />
      <section className="mt-5">
        <DayTimelineRibbon
          schedules={schedules}
          busyEvents={busyEvents}
          activeSession={activeSession}
          locale={locale}
        />
        {weeklyStats ? <WeeklyPeekStrip days={weeklyStats.days} locale={locale} /> : null}
        <EnergyCheckinPill />
      </section>

      {/* 3. Hero Bento Stage — Interactive Living Gate Mission (~66%) + Wallet & Next Move (~34%) */}
      <section
        className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1.95fr)_minmax(340px,1fr)]"
        aria-label={isVi ? "Buồng lái tập trung hôm nay" : "Today's focus cockpit"}
      >
        <DailyMissionCard
          plan={plan}
          settings={workspace.settings}
          todayGrant={todayGrant}
          latestSession={sessions[0]}
          timezone={timezone}
          locale={locale}
          themeId={v2Settings?.gateTheme ?? "stone"}
        />

        <div className="flex flex-col gap-5">
          <RewardWalletCard wallet={wallet} timezone={timezone} locale={locale} />
          <NextMoveCard
            suggestion={nextMove}
            hasPlan={Boolean(plan)}
            totalTasksCount={counts.total}
            completedTasksCount={counts.completed}
            timezone={timezone}
            locale={locale}
          />
        </div>
      </section>

      {/* 4. Compact 2-Column Bottom Row — Tabbed Activity (Due Soon / Sessions) + AI Focus Coach */}
      <section
        className="mt-5 grid gap-5 lg:grid-cols-2 lg:items-stretch"
        aria-label={isVi ? "Hoạt động và trợ lý tập trung" : "Activity and focus coach"}
      >
        <DashboardActivityTabs
          dueSoonTasks={dueSoonTasks}
          recentSessions={sessions}
          timezone={timezone}
          minValidFocusMinutes={workspace.settings.minValidFocusMinutes}
          locale={locale}
        />
        <AiCoachCard stalledTasks={stalledTasks} insights={coachInsights} />
      </section>

      <OnboardingTourModal initiallyOpen={v2Settings !== null && !v2Settings.onboardingCompleted} />
    </div>
  );
}
