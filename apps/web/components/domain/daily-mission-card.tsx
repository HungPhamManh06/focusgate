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
import { Progress } from "@/components/ui/progress";
import { KindBadge, PlanStatusBadge } from "@/components/domain/labels";
import { LivingGateVisual } from "@/components/domain/living-gate-visual";
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
  locale = "en",
}: {
  plan: Plan | null;
  settings: RewardSettings;
  todayGrant?: Grant;
  latestSession?: FocusSession;
  timezone: string;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const vm = buildMissionViewModel(plan, settings, todayGrant, locale);

  return (
    <Card className="overflow-hidden">
      <div>
        {/* Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <p className="label-xs text-muted">{isVi ? "Nhiệm vụ hôm nay" : "Today's mission"}</p>
            {plan ? (
              <PlanStatusBadge status={plan.status} locale={locale} />
            ) : (
              <Badge tone="neutral">{isVi ? "Chưa bắt đầu" : "Not started"}</Badge>
            )}
            {todayGrant ? (
              <Badge tone="success">{isVi ? "Đã nhận thưởng" : "Reward claimed"}</Badge>
            ) : null}
          </div>
          <span className="text-[11.5px] font-medium text-muted tabular-nums">
            {isVi
              ? `Bước ${vm.currentStepNumber} / 05 · ${vm.currentStepLabel}`
              : `Step ${vm.currentStepNumber} of 05 · ${vm.currentStepLabel}`}
          </span>
        </div>

        {/* 5-Stage Connected Stepper: 01 Plan ━━ 02 Commit ━━ 03 Focus ━━ 04 Complete ━━ 05 Unlock */}
        <div className="border-b border-line bg-surface-2/50 px-5 py-3.5 sm:px-7">
          <div className="relative -mx-1 overflow-x-auto px-1 pb-0.5">
            <ol
              aria-label="FocusGate daily journey"
              className="flex min-w-max items-center justify-between gap-1.5 sm:min-w-0"
            >
              {vm.stages.map((stage, index) => {
                const StageIcon = STAGE_ICONS[stage.key];
                const isCompleted = stage.state === "completed";
                const isCurrent = stage.state === "current";
                const nextStage = vm.stages[index + 1];
                const connectorDone =
                  isCompleted &&
                  (nextStage?.state === "completed" || nextStage?.state === "current");

                return (
                  <li
                    key={stage.key}
                    aria-current={isCurrent ? "step" : undefined}
                    className="flex flex-1 items-center gap-1.5 last:flex-initial"
                  >
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-xl border px-3 py-2 transition-colors",
                        isCurrent
                          ? "border-accent bg-accent-soft/85 shadow-[0_1px_2px_rgba(43,89,255,0.08)]"
                          : isCompleted
                            ? "border-success/30 bg-success-soft/50"
                            : "border-line bg-surface",
                      )}
                    >
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

                      <div className=" leading-none">
                        <span
                          className={cn(
                            "block text-[9.5px] font-semibold uppercase tracking-[0.12em] tabular-nums",
                            isCurrent
                              ? "text-accent"
                              : isCompleted
                                ? "text-success"
                                : "text-muted",
                          )}
                        >
                          {stage.stepNumber}
                        </span>
                        <span
                          className={cn(
                            "mt-0.5 block whitespace-nowrap text-[12.5px] font-semibold",
                            isCurrent ? "text-accent" : "text-ink",
                          )}
                        >
                          {stage.label}
                        </span>
                      </div>
                    </div>

                    {index < vm.stages.length - 1 ? (
                      <span
                        aria-hidden
                        className={cn(
                          "h-[2px] min-w-[10px] flex-1 rounded-full transition-colors",
                          connectorDone ? "bg-success/55" : "bg-line",
                        )}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {/* Current Step Detail Panel */}
        <CardContent className="space-y-4 px-5 py-5 sm:px-7">
          {vm.phase === "draft_empty" ? (
            /* STATE B1 — DRAFT WITHOUT MUST-DO: Single clean empty state without duplicate circles/cards */
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
              <div className="max-w-lg">
                <p className="label-xs text-accent">
                  {isVi ? "Bước" : "Step"} {vm.currentStepNumber} · {vm.currentStepLabel}
                </p>
                <h2 className="mt-1.5 font-display text-[30px] leading-[1.06] tracking-[-0.015em] sm:text-[34px]">
                  {vm.headline}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                  {vm.description}
                </p>
                <p className="mt-3 inline-flex items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink tabular-nums">
                  <Target className="size-3.5 text-accent" strokeWidth={1.9} />
                  {vm.statusLine}
                </p>
              </div>

              {plan && plan.tasks.length > 0 ? (
                <div className="w-full rounded-xl border border-line bg-surface-2/50 p-3.5 sm:max-w-[240px]">
                  <p className="label-xs text-muted">
                    {isVi ? `Nháp (${plan.tasks.length})` : `Draft tasks (${plan.tasks.length})`}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {plan.tasks.slice(0, 3).map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2 text-[12px]">
                        <span className="truncate text-ink-soft">{t.title}</span>
                        <KindBadge kind={t.kind} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div className="max-w-xl">
                  <p className="label-xs text-accent">
                    {isVi ? "Bước" : "Step"} {vm.currentStepNumber} · {vm.currentStepLabel}
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
                    {isVi ? "Trạng thái hiện tại" : "Current status"}
                  </p>
                  <p className="mt-1 text-[12.5px] font-semibold text-ink tabular-nums">
                    {vm.statusLine}
                  </p>
                </div>
              </div>

              {!plan ? (
                /* STATE A — NO PLAN */
                <div className="grid gap-3 rounded-2xl border border-line bg-surface-2/60 p-4 sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-medium text-muted">
                      {isVi ? "Thưởng cơ bản" : "Base reward"}
                    </p>
                    <p className="mt-1 font-display text-[24px] leading-none tabular-nums">
                      {formatMinutes(settings.baseMinutes)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {isVi ? "Mở khóa khi xong việc Bắt buộc" : "Unlocked when Must-dos finish"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted">
                      {isVi ? "Thưởng thêm" : "Bonus upside"}
                    </p>
                    <p className="mt-1 font-display text-[24px] leading-none tabular-nums">
                      +{formatMinutes(settings.bonusMinutesPerTask)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {isVi
                        ? `Mỗi việc thưởng (tối đa ${formatMinutes(settings.maxBonusMinutes)})`
                        : `Per bonus task (up to ${formatMinutes(settings.maxBonusMinutes)})`}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted">
                      {isVi ? "Quy tắc tập trung" : "Verified focus rule"}
                    </p>
                    <p className="mt-1 font-display text-[24px] leading-none tabular-nums">
                      {formatMinutes(settings.minValidFocusMinutes)}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">
                      {isVi ? "Thời lượng tối thiểu 1 phiên hợp lệ" : "Minimum valid session length"}
                    </p>
                  </div>
                </div>
              ) : (
                /* STATES B2, C, D, E — POPULATED PLAN WITH MUST-DOS */
                <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                  {vm.hasMustDos && vm.mustDoPercent !== null ? (
                    <LivingGateVisual
                      status={plan.status}
                      mustDoCompleted={plan.progress.mustDoCompleted}
                      mustDoTotal={plan.progress.mustDoTotal}
                      isUnlocked={Boolean(todayGrant) || plan.status === "completed"}
                      locale={locale}
                    />
                  ) : null}

                  <div className="min-w-0 space-y-4">
                    {/* Focus Coverage: Only show progress bar when a focus target is configured */}
                    {vm.hasFocusTarget && vm.focusPercent !== null ? (
                      <div className="rounded-2xl border border-line bg-surface-2/60 px-4 py-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-[12px] font-medium text-ink-soft">
                            {isVi ? "Tiến độ tập trung hợp lệ" : "Verified focus coverage"}
                          </p>
                          <p className="text-[12px] font-semibold tabular-nums">
                            {formatMinutes(plan.progress.focusDone)} /{" "}
                            {formatMinutes(plan.progress.focusRequired)}
                          </p>
                        </div>
                        <Progress
                          value={vm.focusPercent}
                          tone={vm.focusPercent >= 100 ? "success" : "accent"}
                          label={isVi ? "Tiến độ tập trung hợp lệ" : "Verified focus coverage"}
                          className="mt-2"
                        />
                        {plan.status === "active" && latestSession ? (
                          <p className="mt-2 text-[11px] text-muted">
                            {isVi ? "Phiên gần nhất: " : "Latest session: "}
                            <span className="font-medium text-ink-soft">
                              {latestSession.taskTitle ?? (isVi ? "Tập trung tự do" : "Free focus")}
                            </span>{" "}
                            ({formatMinutes(latestSession.isValid ? latestSession.creditedMinutes : latestSession.actualMinutes)}{" "}
                            {isVi ? "lúc" : "at"} {formatTime(latestSession.startedAt, timezone)})
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-line bg-surface-2/50 px-4 py-3">
                        <p className="text-[12px] font-semibold text-ink">
                          {isVi ? "Chưa đặt mục tiêu tập trung." : "Focus target not set."}
                        </p>
                        <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                          {isVi
                            ? "Thêm số phút tập trung yêu cầu cho việc Bắt buộc trong trang Kế hoạch."
                            : "Add required focus minutes to your Must-do task in the planner."}
                        </p>
                      </div>
                    )}

                    {/* Committed Task List */}
                    {plan.tasks.length > 0 ? (
                      <div>
                        <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
                          <span>
                            {isVi ? "Nhiệm vụ đã cam kết (" : "Committed tasks ("}
                            {
                              plan.tasks.filter(
                                (t) => Boolean(t.completedAt) || t.status === "completed",
                              ).length
                            }{" "}
                            {isVi ? "/" : "of"} {plan.tasks.length} {isVi ? "xong)" : "done)"}
                          </span>
                          <span className="tabular-nums">
                            {isVi ? "Thưởng ước tính:" : "Est. reward:"}{" "}
                            {formatMinutes(vm.estimatedReward)}
                          </span>
                        </div>
                        <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                          {plan.tasks.slice(0, 4).map((task) => {
                            const done =
                              Boolean(task.completedAt) || task.status === "completed";
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
                                      ? isVi
                                        ? `còn ${formatMinutes(taskFocusLeft)} tập trung`
                                        : `${formatMinutes(taskFocusLeft)} focus left`
                                      : isVi
                                        ? "đủ giờ tập trung"
                                        : "focus met"}
                                  </span>
                                ) : null}
                                <KindBadge kind={task.kind} locale={locale} />
                              </li>
                            );
                          })}
                        </ul>
                        {plan.tasks.length > 4 ? (
                          <p className="mt-2 text-[11px] text-muted">
                            {isVi
                              ? `+${plan.tasks.length - 4} nhiệm vụ khác trong kế hoạch hôm nay`
                              : `+${plan.tasks.length - 4} more task${plan.tasks.length - 4 === 1 ? "" : "s"} in today's plan`}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </div>

      {/* Footer Actions — Strictly the single Primary CTA for the current Mission step */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-surface-2/40 px-5 py-4 sm:px-7">
        {vm.phase === "no_plan" ? (
          <>
            <ActionButton action={createPlanAction} variant="accent" size="md">
              <Sparkles className="size-4" />{" "}
              {isVi ? "Tạo kế hoạch hôm nay" : "Create today's plan"}
            </ActionButton>
            <p className="text-[11.5px] text-muted">
              {isVi
                ? "Bước 01 / 05 · Thiết lập cam kết Bắt buộc hôm nay."
                : "Step 01 of 05 · Establish today's Must-do contract."}
            </p>
          </>
        ) : vm.phase === "draft_empty" ? (
          <>
            <Link href="/planner" className={buttonVariants({ variant: "accent", size: "md" })}>
              <CalendarClock className="size-4" />{" "}
              {isVi ? "Thêm việc vào kế hoạch hôm nay" : "Add tasks to today's plan"}
            </Link>
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "Cần ít nhất 1 nhiệm vụ Bắt buộc trước khi xác nhận."
                : "At least one Must-do task is required before confirming."}
            </p>
          </>
        ) : vm.phase === "draft_ready" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={confirmPlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                confirmTitle={isVi ? "Chốt cổng hôm nay?" : "Lock today's gate?"}
                confirmMessage={
                  isVi
                    ? "Xác nhận sẽ khóa các cam kết Bắt buộc trong ngày. Mọi thay đổi giảm cam kết sau đó đều được ghi nhận ngoại lệ."
                    : "Confirming locks your Must-do commitments for the day. Any later downgrade requires an audited exception."
                }
                confirmLabel={isVi ? "Xác nhận & khóa" : "Confirm & lock plan"}
                pendingLabel={isVi ? "Đang xác nhận…" : "Confirming…"}
              >
                <Lock className="size-4" /> {isVi ? "Xác nhận kế hoạch" : "Confirm plan"}
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                {isVi ? "Sửa kế hoạch" : "Edit plan"}
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              {isVi
                ? "Bản nháp sẵn sàng — xác nhận để khóa cam kết Bắt buộc."
                : "Draft ready — confirm to lock your Must-do commitments."}
            </p>
          </>
        ) : vm.phase === "confirmed" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={activatePlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                pendingLabel={isVi ? "Đang kích hoạt…" : "Activating…"}
              >
                <Flame className="size-4" /> {isVi ? "Kích hoạt tập trung" : "Activate focus"}
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                {isVi ? "Xem kế hoạch" : "View plan"}
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              {isVi
                ? "Kích hoạt chế độ tập trung để bắt đầu ghi nhận phiên hợp lệ."
                : "Activate focus mode to start logging verified sessions."}
            </p>
          </>
        ) : vm.phase === "active_focus" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/focus" className={buttonVariants({ variant: "accent", size: "md" })}>
                <Timer className="size-4" /> {isVi ? "Vào Tập trung" : "Go to focus"}
              </Link>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                {isVi ? "Xem kế hoạch" : "View plan"}
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              {isVi
                ? "Hoàn thành phiên tập trung và đánh dấu xong việc Bắt buộc trong Kế hoạch."
                : "Complete verified focus and mark Must-dos done in the planner."}
            </p>
          </>
        ) : vm.phase === "active_ready_to_close" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={completePlanAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                confirmTitle={isVi ? "Chốt kế hoạch hôm nay?" : "Close today's plan?"}
                confirmMessage={
                  isVi
                    ? "Mọi việc Bắt buộc và mục tiêu tập trung đã hoàn thành. Chốt ngày để mở khóa phần thưởng?"
                    : "Every Must-do task and focus target is complete. Close the day to unlock your reward?"
                }
                confirmLabel={isVi ? "Hoàn thành ngày" : "Complete day"}
              >
                <CheckCircle2 className="size-4" /> {isVi ? "Hoàn thành ngày" : "Complete day"}
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                {isVi ? "Xem kế hoạch" : "View plan"}
              </Link>
            </div>
            <p className="text-[11.5px] text-success">
              {isVi
                ? "Tất cả việc Bắt buộc đã xong — chốt ngày để nhận thưởng."
                : "All Must-dos verified — close the day to claim your reward."}
            </p>
          </>
        ) : vm.phase === "completed_unclaimed" && plan ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                action={claimRewardAction.bind(null, plan.id)}
                variant="accent"
                size="md"
                pendingLabel={isVi ? "Đang nhận…" : "Claiming…"}
              >
                <Sparkles className="size-4" /> {isVi ? "Nhận thưởng" : "Claim reward"}
              </ActionButton>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                {isVi ? "Xem tóm tắt" : "View summary"}
              </Link>
            </div>
            <p className="text-[11.5px] text-muted">
              {isVi
                ? `Thưởng ước tính: ${formatMinutes(vm.estimatedReward)} (hết hạn lúc 04:00 ngày mai).`
                : `Est. grant: ${formatMinutes(vm.estimatedReward)} (expires 04:00 tomorrow).`}
            </p>
          </>
        ) : vm.phase === "completed_claimed" ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/wallet" className={buttonVariants({ variant: "accent", size: "md" })}>
                {isVi ? "Xem ví thưởng" : "View wallet"} <ArrowRight className="size-4" />
              </Link>
              <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
                {isVi ? "Xem tiến độ hôm nay" : "Review today's progress"}
              </Link>
            </div>
            <p className="text-[11.5px] font-medium text-success">
              {isVi
                ? "Đã nhận thưởng và cộng vào ví của bạn."
                : "Reward claimed and added to your wallet."}
            </p>
          </>
        ) : null}
      </div>
    </Card>
  );
}
