import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CircleDot,
  Clock3,
  History,
  ListTodo,
  Lock,
  Sparkles,
  Target,
  Timer,
  Wallet,
} from "lucide-react";
import {
  activatePlanAction,
  completePlanAction,
  confirmAndActivatePlanAction,
  createPlanAction,
  populateTodayHabitsAction,
} from "@/lib/actions/planner";
import { claimRewardAction } from "@/lib/actions/rewards";
import { ActionButton } from "@/components/ui/action-button";
import { HoldActionButton } from "@/components/ui/hold-action-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { KindBadge, PlanStatusBadge, getKindLabel, kindDescriptions } from "@/components/domain/labels";
import { formatDateLong, formatMinutes, formatTime, todayIso } from "@/lib/data/format";
import { buildPlannerSummaryViewModel } from "@/lib/domain/tasks-planner-state";
import { getPlannerBacklog, getTodayPlan } from "@/lib/data/planner";
import { getV2Settings } from "@/lib/data/v2-settings";
import { listGoals, listPlanSchedules } from "@/lib/data/v3-features";
import { listPlanTemplates, listRecurringRules } from "@/lib/data/v4-ecosystem";
import { fetchTodayCalendarEvents } from "@/lib/data/v5-ecosystem";
import { totalBusyMinutes } from "@/lib/domain/ics-parser";
import { getWorkspace } from "@/lib/data/workspace";
import type { Plan, PlanStatus, TaskKind } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { AddPlanTask } from "./add-plan-task";
import { PlanTaskRow } from "./plan-task-row";
import { PlannerTabsShell } from "./planner-tabs-shell";
import { TemplatesRoutinesCard } from "./templates-routines-card";
import { V2PlannerTools } from "./v2-planner-tools";
import { V3GoalsTimeline } from "./v3-goals-timeline";

export const dynamic = "force-dynamic";

const kindOrder: TaskKind[] = ["must_do", "should_do", "bonus"];

const steps: {
  status: Exclude<PlanStatus, "cancelled">;
  label: string;
  labelVi: string;
  hint: string;
  hintVi: string;
}[] = [
  { status: "draft", label: "Draft", labelVi: "Bản nháp", hint: "Choose tasks and focus targets", hintVi: "Chọn việc và mục tiêu tập trung" },
  { status: "confirmed", label: "Confirm", labelVi: "Chốt", hint: "Lock the gate for the day", hintVi: "Khóa cổng cho hôm nay" },
  { status: "active", label: "Focus", labelVi: "Tập trung", hint: "Log verified sessions", hintVi: "Ghi nhận phiên hợp lệ" },
  { status: "completed", label: "Complete", labelVi: "Hoàn thành", hint: "Claim the earned reward", hintVi: "Nhận phần thưởng" },
];

function EventLabel({ eventType, isVi }: { eventType: string; isVi: boolean }) {
  if (isVi) {
    const map: Record<string, string> = {
      plan_created: "Đã tạo kế hoạch",
      plan_confirmed: "Đã xác nhận kế hoạch",
      plan_activated: "Đã kích hoạt tập trung",
      plan_completed: "Đã hoàn thành kế hoạch",
      task_added: "Đã thêm nhiệm vụ",
      task_removed: "Đã xóa nhiệm vụ",
      task_amended: "Đã điều chỉnh cam kết",
      task_completed: "Đã hoàn thành nhiệm vụ",
      reward_claimed: "Đã nhận thưởng",
    };
    if (map[eventType]) return <>{map[eventType]}</>;
  }
  const label = eventType
    .split("_")
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
  return <>{label}</>;
}

function PlanStepper({ plan, isVi }: { plan: Plan; isVi: boolean }) {
  const matchedIndex = steps.findIndex((step) => step.status === plan.status);
  const currentIndex = Math.max(0, matchedIndex);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {steps.map((step, index) => {
        const complete = index < currentIndex || plan.status === "completed";
        const current = index === currentIndex && plan.status !== "completed";
        return (
          <div
            key={step.status}
            className={cn(
              "relative rounded-xl border px-3 py-2 sm:px-3.5 sm:py-3",
              current
                ? "border-accent/35 bg-accent-soft/60"
                : complete
                  ? "border-success/25 bg-success-soft/40"
                  : "border-line bg-surface-2/50",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  complete
                    ? "bg-success text-white"
                    : current
                      ? "bg-accent text-white"
                      : "bg-line text-muted",
                )}
              >
                {complete ? <Check className="size-3" strokeWidth={3} /> : index + 1}
              </span>
              <p className={cn("text-[12px] font-medium", current && "text-accent")}>
                {isVi ? step.labelVi : step.label}
              </p>
            </div>
            <p className="mt-1.5 hidden pl-7 text-[10.5px] leading-snug text-muted sm:block">
              {isVi ? step.hintVi : step.hint}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default async function PlannerPage() {
  const [workspace, plan, goals, v2Settings] = await Promise.all([
    getWorkspace(),
    getTodayPlan(),
    listGoals(),
    getV2Settings().catch(() => null),
  ]);
  const locale = v2Settings?.language ?? "en";
  const isVi = locale === "vi";
  const [backlog, schedules, planTemplates, recurringRules, busyEvents] = await Promise.all([
    getPlannerBacklog(plan?.id ?? null),
    listPlanSchedules(plan?.id ?? null),
    listPlanTemplates(locale).catch(() => []),
    listRecurringRules().catch(() => []),
    fetchTodayCalendarEvents(v2Settings?.calendarIcsUrl, todayIso(workspace.profile.timezone)),
  ]);
  const pendingEstimatedMinutes =
    (plan?.tasks ?? [])
      .filter((t) => !t.completedAt)
      .reduce((sum, t) => sum + Math.max(15, t.requiredFocusMinutes || 30), 0) +
    (v2Settings?.calendarAutoLock ? totalBusyMinutes(busyEvents) : 0);
  const { timezone, displayName } = workspace.profile;
  const today = todayIso(timezone);
  const planDate = plan?.planDate ?? today;
  const dateLabel = formatDateLong(`${planDate}T12:00:00Z`, timezone, locale);

  const kindDescriptionsVi: Record<TaskKind, string> = {
    must_do: "Được bảo vệ bởi phiên tập trung và bắt buộc hoàn thành để mở khóa ngày.",
    should_do: "Đẩy tiến độ công việc sau khi đã lo xong các việc cốt lõi.",
    bonus: "Nhiệm vụ tùy chọn giúp kiếm thêm phút thưởng.",
  };

  const mustDoTasks = plan?.tasks.filter((task) => task.kind === "must_do") ?? [];
  const summary = plan ? buildPlannerSummaryViewModel(plan) : null;
  const rewardEstimate = plan
    ? Math.min(
        workspace.settings.dailyCapMinutes,
        workspace.settings.baseMinutes +
          Math.min(
            plan.progress.bonusCompleted * workspace.settings.bonusMinutesPerTask,
            workspace.settings.maxBonusMinutes,
          ),
      )
    : workspace.settings.baseMinutes;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={dateLabel}
        title={isVi ? "Lên kế hoạch cho ngày mới." : "The day, decided in advance."}
        description={
          isVi
            ? `Kế hoạch cho ${displayName.split(/\s+/)[0] ?? displayName}. Cam kết một vài việc Bắt buộc, phần còn lại để sự tập trung dẫn lối.`
            : `Plan for ${displayName.split(/\s+/)[0] ?? displayName}. Commit to a small number of must-dos, then let verified focus carry the rest.`
        }
        actions={
          <Link href="/tasks" className={buttonVariants({ variant: "outline", size: "md" })}>
            <ListTodo className="size-4" /> {isVi ? "Quản lý nhiệm vụ" : "Manage tasks"}
          </Link>
        }
      />

      {!plan ? (
        <div className="mt-7 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="overflow-hidden">
            <div className="relative px-6 py-10 sm:px-10 sm:py-12">
              <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent-soft/70 blur-3xl" />
              <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                <CalendarClock className="size-5" strokeWidth={1.8} />
              </span>
              <h2 className="mt-5 font-display text-[32px] leading-none tracking-[-0.01em]">
                {isVi ? "Chưa có kế hoạch hôm nay." : "No plan for today. Yet."}
              </h2>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
                {isVi
                  ? "Kế hoạch biến ý định thành cam kết: mỗi việc Bắt buộc cần sự tập trung thực sự, và hoàn thành ngày sẽ mở khóa thời gian thưởng."
                  : "A plan turns intention into a gate: every must-do needs real focus, and finishing the day is what unlocks your reward minutes."}
              </p>
              <div className="mt-6 flex flex-wrap gap-2.5">
                <ActionButton action={createPlanAction} variant="accent" size="lg">
                  <Sparkles className="size-4" />{" "}
                  {isVi ? "Tạo kế hoạch hôm nay" : "Create today's plan"}
                </ActionButton>
                <ActionButton
                  action={populateTodayHabitsAction.bind(null, null)}
                  variant="outline"
                  size="lg"
                >
                  <History className="size-4" />{" "}
                  {isVi ? "Nạp thói quen / sao chép hôm qua" : "Load habits / copy yesterday"}
                </ActionButton>
              </div>
            </div>
            <div className="grid border-t border-line sm:grid-cols-2">
              {(isVi
                ? [
                    { icon: Target, title: "Chọn việc Bắt buộc", copy: "Nên chọn 1–3 việc. Đây là thước đo hoàn thành ngày." },
                    { icon: Clock3, title: "Đặt mục tiêu tập trung", copy: "Số phút cần được xác thực qua phiên bấm giờ." },
                    { icon: Lock, title: "Chốt cổng ngày", copy: "Khóa chỉnh sửa. Kế hoạch trở thành cam kết." },
                    { icon: Wallet, title: "Nhận phần thưởng", copy: "Hoàn thành ngày để mở khóa thời gian giải trí." },
                  ]
                : [
                    { icon: Target, title: "Pick must-dos", copy: "Aim for 1–3. These decide whether the day counts." },
                    { icon: Clock3, title: "Set focus targets", copy: "Minutes that must be verified by real sessions." },
                    { icon: Lock, title: "Confirm the gate", copy: "No more editing. The plan becomes a contract." },
                    { icon: Wallet, title: "Earn the reward", copy: "Finish the day, unlock intentional entertainment time." },
                  ]
              ).map((item) => (
                <div key={item.title} className="border-b border-line p-5 last:border-b-0 sm:p-6 sm:even:border-l sm:[&:nth-child(3)]:border-b-0">
                  <item.icon className="size-4 text-accent" strokeWidth={1.8} />
                  <p className="mt-3 text-[12.5px] font-medium">{item.title}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{item.copy}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>{isVi ? "Hàng chờ sẵn sàng" : "Backlog ready"}</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  {isVi
                    ? `${backlog.length} nhiệm vụ đang mở.`
                    : `${backlog.length} open task${backlog.length === 1 ? "" : "s"} waiting.`}
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {backlog.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title={isVi ? "Hàng chờ đang trống" : "Nothing in the backlog"}
                  description={
                    isVi
                      ? "Tạo nhiệm vụ trước, sau đó quay lại lên kế hoạch cho hôm nay."
                      : "Create tasks first, then come back and choose the day."
                  }
                  action={
                    <Link href="/tasks" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {isVi ? "Thêm nhiệm vụ" : "Add tasks"}
                    </Link>
                  }
                  className="px-5 py-7"
                />
              ) : (
                <ul className="space-y-3">
                  {backlog.slice(0, 5).map((task) => (
                    <li key={task.id} className="flex items-center gap-2.5">
                      <CircleDot className="size-3.5 shrink-0 text-muted/60" />
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">{task.title}</span>
                      <KindBadge kind={task.kind} locale={locale} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <PlanStatusBadge status={plan.status} locale={locale} />
            <span className="text-[11.5px] text-muted">
              {isVi
                ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} Bắt buộc · ${formatMinutes(plan.progress.focusDone)} tập trung`
                : summary?.headerMetaLine}
            </span>
          </div>

          <div className="mt-4">
            <PlanStepper plan={plan} isVi={isVi} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              {plan.tasks.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Sparkles}
                    title={isVi ? "Kế hoạch này chưa có nhiệm vụ" : "This plan has no tasks"}
                    description={
                      plan.status === "draft"
                        ? isVi
                          ? "Thêm một vài việc Bắt buộc từ hàng chờ để làm trụ cột cho ngày hôm nay."
                          : "Add a few must-dos from the backlog to give the day a spine."
                        : isVi
                          ? "Kế hoạch này được chốt khi chưa có nhiệm vụ. Hoàn thành nó và tạo kế hoạch mới cho ngày mai."
                          : "This plan was confirmed empty. Complete it and create a fresh plan for tomorrow."
                    }
                    className="border-0 bg-transparent shadow-none"
                  />
                </Card>
              ) : (
                kindOrder.map((kind) => {
                  const tasks = plan.tasks.filter((task) => task.kind === kind);
                  if (tasks.length === 0) return null;
                  return (
                    <Card key={kind} className="overflow-hidden">
                      <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-[13px] font-semibold">
                              {getKindLabel(kind, locale)}
                            </h2>
                            <KindBadge kind={kind} locale={locale} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            {isVi ? kindDescriptionsVi[kind] : kindDescriptions[kind]}
                          </p>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted">{tasks.length}</span>
                      </div>
                      {tasks.map((task) => (
                        <PlanTaskRow key={task.id} task={task} planStatus={plan.status} />
                      ))}
                    </Card>
                  );
                })
              )}

              {plan.status === "draft" || plan.status === "confirmed" || plan.status === "active" ? (
                <Card>
                  <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>
                        {plan.status === "draft"
                          ? isVi
                            ? "Thêm từ hàng chờ"
                            : "Add from backlog"
                          : isVi
                            ? "Thêm việc phát sinh từ hàng chờ"
                            : "Add unplanned tasks from backlog"}
                      </CardTitle>
                      <p className="mt-1 text-[12px] text-muted">
                        {plan.status === "draft"
                          ? isVi
                            ? `${backlog.length} nhiệm vụ chưa có trong kế hoạch.`
                            : `${backlog.length} open task${backlog.length === 1 ? "" : "s"} not in this plan.`
                          : isVi
                            ? `${backlog.length} nhiệm vụ đang mở. Các việc Bắt buộc đã chốt vẫn được giữ nguyên, bạn vẫn có thể bổ sung thêm việc phát sinh hôm nay.`
                            : `${backlog.length} open task${backlog.length === 1 ? "" : "s"} waiting. Committed tasks stay locked while you can still add unplanned tasks for today.`}
                      </p>
                    </div>
                    {plan.status === "draft" ? (
                      <ActionButton
                        action={populateTodayHabitsAction.bind(null, plan.id)}
                        variant="outline"
                        size="sm"
                      >
                        <History className="size-3.5" />{" "}
                        {isVi ? "Nạp thói quen / hôm qua" : "Load habits / yesterday"}
                      </ActionButton>
                    ) : null}
                  </CardHeader>
                  <CardContent className="pt-4">
                    <AddPlanTask planId={plan.id} tasks={backlog} timezone={timezone} />
                  </CardContent>
                </Card>
              ) : null}

              {plan.events.length > 0 ? (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <History className="size-4 text-muted" strokeWidth={1.8} />
                      <CardTitle>{isVi ? "Lịch sử cổng ngày" : "Gate history"}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <ol className="space-y-3">
                      {plan.events.map((event, index) => (
                        <li key={event.id} className="flex gap-3">
                          <div className="flex flex-col items-center">
                            <span
                              className={cn(
                                "mt-1 size-1.5 rounded-full",
                                index === 0 ? "bg-accent" : "bg-line",
                              )}
                            />
                            {index < plan.events.length - 1 ? (
                              <span className="mt-1 w-px flex-1 bg-line" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 pb-1">
                            <p className="text-[12px] font-medium">
                              <EventLabel eventType={event.eventType} isVi={isVi} />
                            </p>
                            {event.reason ? (
                              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{event.reason}</p>
                            ) : null}
                            <p className="mt-0.5 text-[10.5px] text-muted">
                              {formatTime(event.createdAt, timezone)}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
              <Card>
                <CardHeader>
                  <CardTitle>{isVi ? "Tóm tắt cổng ngày" : "Gate summary"}</CardTitle>
                  <PlanStatusBadge status={plan.status} locale={locale} />
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="label-xs text-muted">
                        {isVi ? "Tiến độ Bắt buộc" : "Must-do progress"}
                      </p>
                      <p
                        className={cn(
                          "mt-2 font-display leading-none",
                          summary?.hasMustDos ? "text-[36px]" : "text-[24px] text-muted",
                        )}
                      >
                        {isVi && !summary?.hasMustDos ? "Chưa có" : summary?.mustDoHeadline}
                      </p>
                    </div>
                    <p className="pb-1 text-[11.5px] text-muted">
                      {isVi
                        ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} việc`
                        : summary?.mustDoCountLabel}
                    </p>
                  </div>
                  <Progress
                    value={summary?.mustDoProgressPercent ?? 0}
                    tone={
                      summary?.hasMustDos && summary.mustDoProgressPercent === 100
                        ? "success"
                        : "accent"
                    }
                    className="mt-3"
                  />

                  <dl className="mt-5 space-y-3 border-t border-line pt-4">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Timer className="size-3.5" /> {isVi ? "Đã tập trung" : "Focus done"}
                      </dt>
                      <dd className="text-[12px] font-medium">
                        {summary?.focusDoneLabel}
                        {summary?.focusTargetSuffix ? (
                          <span className="font-normal text-muted">
                            {" "}
                            {summary.focusTargetSuffix}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Target className="size-3.5" /> {isVi ? "Độ phủ tập trung" : "Focus coverage"}
                      </dt>
                      <dd className="text-[12px] font-medium">
                        {isVi && summary?.focusCoverageLabel === "Not set"
                          ? "Chưa đặt"
                          : summary?.focusCoverageLabel}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Clock3 className="size-3.5" />{" "}
                        {isVi ? "Tổng tập trung kế hoạch" : "Total plan focus"}
                      </dt>
                      <dd className="text-[12px] font-medium">{summary?.totalPlanFocusLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Sparkles className="size-3.5" />{" "}
                        {isVi ? "Việc thưởng đã xong" : "Bonus completed"}
                      </dt>
                      <dd className="text-[12px] font-medium">{plan.progress.bonusCompleted}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Wallet className="size-3.5" /> {isVi ? "Thưởng ước tính" : "Est. reward"}
                      </dt>
                      <dd className="text-[12px] font-medium">{formatMinutes(rewardEstimate)}</dd>
                    </div>
                  </dl>

                  <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
                    {isVi
                      ? `Cơ bản ${formatMinutes(workspace.settings.baseMinutes)} + ${formatMinutes(workspace.settings.bonusMinutesPerTask)} mỗi việc thưởng, tối đa ${formatMinutes(workspace.settings.dailyCapMinutes)}. Phiên hợp lệ cần ít nhất ${formatMinutes(workspace.settings.minValidFocusMinutes)}.`
                      : `Base ${formatMinutes(workspace.settings.baseMinutes)} + ${formatMinutes(workspace.settings.bonusMinutesPerTask)} per bonus, capped at ${formatMinutes(workspace.settings.dailyCapMinutes)}. Valid focus needs at least ${formatMinutes(workspace.settings.minValidFocusMinutes)}.`}
                  </p>

                  {summary?.isOverloaded ? (
                    <p className="mt-3 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
                      {isVi
                        ? `Cam kết nặng (${summary.totalPlanFocusLabel} cần tập trung). Cân nhắc bỏ bớt việc không thiết yếu nếu >6h là quá sức hôm nay.`
                        : `Heavy commitment (${summary.totalPlanFocusLabel} required focus). Consider moving non-essential tasks out if 6h+ is unrealistic today.`}
                    </p>
                  ) : null}

                  <div className="mt-5 space-y-2">
                    {plan.status === "draft" ? (
                      <>
                        <HoldActionButton
                          action={confirmAndActivatePlanAction.bind(null, plan.id)}
                          label={isVi ? "Giữ 1.5s để Khóa Cổng hôm nay" : "Hold 1.5s to Lock Today's Gate"}
                          holdingLabel={isVi ? "Đang khóa cổng…" : "Locking gate…"}
                          pendingLabel={isVi ? "Đang kích hoạt…" : "Activating…"}
                          hintLabel={
                            plan.progress.mustDoTotal === 0
                              ? isVi
                                ? "Thêm ít nhất 1 việc Bắt buộc để mở khóa nút cam kết."
                                : "Add at least one must-do to enable locking."
                              : isVi
                                ? "Nghi thức cam kết: nhấn giữ 1.5 giây để chốt việc Bắt buộc và mở chế độ tập trung."
                                : "Commitment ritual: press and hold 1.5s to lock Must-dos and activate focus."
                          }
                          disabled={plan.progress.mustDoTotal === 0}
                        />
                      </>
                    ) : null}

                    {plan.status === "confirmed" ? (
                      <ActionButton
                        action={activatePlanAction.bind(null, plan.id)}
                        variant="accent"
                        className="w-full"
                      >
                        <Timer className="size-4" />{" "}
                        {isVi ? "Kích hoạt tập trung" : "Activate focus"}
                      </ActionButton>
                    ) : null}

                    {plan.status === "active" ? (
                      <>
                        <Link
                          href="/focus"
                          className={buttonVariants({ variant: "accent", size: "md", className: "w-full" })}
                        >
                          <Timer className="size-4" />{" "}
                          {isVi ? "Bắt đầu phiên tập trung" : "Start a focus block"}
                        </Link>
                        <ActionButton
                          action={completePlanAction.bind(null, plan.id)}
                          variant="outline"
                          className="w-full"
                          confirmTitle={isVi ? "Chốt kế hoạch hôm nay?" : "Close today's plan?"}
                          confirmMessage={
                            isVi
                              ? "Mọi việc Bắt buộc cần đủ tập trung hợp lệ trước. Sau khi chốt, bạn có thể nhận phần thưởng."
                              : "Every Must-Do task needs verified focus first. Once closed, your reward grant is ready to claim."
                          }
                          confirmLabel={isVi ? "Hoàn thành ngày" : "Complete day"}
                        >
                          {isVi ? "Hoàn thành ngày" : "Complete day"}
                        </ActionButton>
                      </>
                    ) : null}

                    {plan.status === "completed" ? (
                      <>
                        <ActionButton
                          action={claimRewardAction.bind(null, plan.id)}
                          variant="accent"
                          className="w-full"
                        >
                          <Sparkles className="size-4" /> {isVi ? "Nhận thưởng" : "Claim reward"}
                        </ActionButton>
                        <Link
                          href="/wallet"
                          className={buttonVariants({ variant: "outline", size: "md", className: "w-full" })}
                        >
                          {isVi ? "Mở ví thưởng" : "Open wallet"} <ArrowRight className="size-3.5" />
                        </Link>
                      </>
                    ) : null}
                  </div>

                  {mustDoTasks.length > 0 ? (
                    <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted">
                      {isVi
                        ? `Đã xong ${mustDoTasks.filter((task) => task.completedAt).length} / ${mustDoTasks.length} việc Bắt buộc.`
                        : `${mustDoTasks.filter((task) => task.completedAt).length} of ${mustDoTasks.length} must-dos complete.`}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </aside>
          </div>
        </>
      )}

      <PlannerTabsShell
        timelinePanel={
          <V3GoalsTimeline
            goals={goals}
            schedules={schedules}
            pendingEstimatedMinutes={pendingEstimatedMinutes}
          />
        }
        templatesPanel={
          <TemplatesRoutinesCard
            templates={planTemplates}
            recurringRules={recurringRules}
          />
        }
        toolsPanel={
          <V2PlannerTools
            todayDate={today}
            yesterdayDate={new Date(new Date(`${today}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10)}
            tomorrowDate={new Date(new Date(`${today}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10)}
            totalTasks={plan?.tasks.length ?? 0}
            completedTasks={plan?.tasks.filter((t) => Boolean(t.completedAt)).length ?? 0}
            focusMinutes={plan?.progress.focusDone ?? 0}
          />
        }
      />
    </div>
  );
}
