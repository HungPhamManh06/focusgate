import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ShieldCheck,
  Timer,
  Wallet,
} from "lucide-react";
import { ActionButton } from "@/components/ui/action-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  activatePlanAction,
  completePlanTaskAction,
  confirmAndActivatePlanAction,
} from "@/lib/actions/planner";
import { formatMinutes, formatTime } from "@/lib/data/format";
import {
  getActiveSession,
  getFocusCandidates,
  getTodayFocusSummary,
  getTodaySessions,
} from "@/lib/data/focus";
import { getTodayPlan } from "@/lib/data/planner";
import { getV2Settings } from "@/lib/data/v2-settings";
import { listRecentFocusNotes } from "@/lib/data/v3-features";
import { getWorkspace } from "@/lib/data/workspace";
import {
  buildFocusPageMetrics,
  formatFocusModeLabel,
  formatSessionDurationSummary,
} from "@/lib/domain/focus-timer-state";
import {
  findReadyToCompletePlanTasks,
  resolveInitialFocusTaskId,
} from "@/lib/domain/tasks-planner-state";
import { FocusStarter } from "./focus-starter";
import { FocusTimer } from "./focus-timer";
import { SessionNotesCard } from "./session-notes-card";

export const dynamic = "force-dynamic";

export default async function FocusPage({
  searchParams,
}: {
  searchParams?: Promise<{ taskId?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const [workspace, active, candidates, sessions, summary, plan, focusNotes, v2Settings] = await Promise.all([
    getWorkspace(),
    getActiveSession(),
    getFocusCandidates(),
    getTodaySessions(10),
    getTodayFocusSummary(),
    getTodayPlan(),
    listRecentFocusNotes(5),
    getV2Settings().catch(() => null),
  ]);

  const isVi = (v2Settings?.language ?? "en") === "vi";
  const { timezone } = workspace.profile;
  const initialTaskId = resolveInitialFocusTaskId(candidates, params.taskId ?? null);
  const readyToComplete = active ? [] : findReadyToCompletePlanTasks(plan);
  const metrics = buildFocusPageMetrics({
    sessionsCount: summary.sessions,
    validSessionsCount: summary.validSessions,
    minValidFocusMinutes: workspace.settings.minValidFocusMinutes,
    plan,
  });

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={isVi ? "Chế độ tập trung" : "Focus mode"}
        title={
          active
            ? isVi ? "Cổng đang mở." : "The gate is open."
            : isVi ? "Bảo vệ giờ tiếp theo." : "Protect the next hour."
        }
        description={
          active
            ? isVi
              ? "Mỗi lần một phiên. Đồng hồ chạy theo mốc thời gian máy chủ; hãy kết thúc khi công việc thực sự hoàn thành."
              : "One session at a time. The clock is running on the server start timestamp; end it when the work is genuinely done."
            : isVi
              ? "Một phiên chỉ được tính khi đạt ngưỡng tối thiểu và được máy chủ xác thực. Chọn một việc và bắt đầu."
              : "A block only counts when it meets the minimum threshold and is verified by the server. Choose one thing and begin."
        }
        actions={
          <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
            <CalendarClock className="size-4" /> {isVi ? "Kế hoạch hôm nay" : "Today's plan"}
          </Link>
        }
      />

      {active ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-[12px] text-muted">
          <span>
            {isVi ? "Tập trung hôm nay:" : "Focus today:"}{" "}
            <strong className="font-medium text-ink">{formatMinutes(summary.minutes)}</strong>
          </span>
          <span aria-hidden>·</span>
          <span>
            {isVi ? "Tỉ lệ hợp lệ:" : "Valid rate:"}{" "}
            <strong className="font-medium text-ink">{metrics.validRateValue}</strong>
          </span>
          <span aria-hidden>·</span>
          <span>
            {isVi ? "Còn lại trong kế hoạch:" : "Plan focus left:"}{" "}
            <strong className="font-medium text-ink">{metrics.planFocusLeftValue}</strong>
          </span>
        </div>
      ) : (
        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <StatCard
            label={isVi ? "Tập trung hôm nay" : "Focus today"}
            value={formatMinutes(summary.minutes)}
            hint={
              summary.sessions > 0
                ? isVi
                  ? `${summary.validSessions} phiên hợp lệ / ${summary.sessions} phiên`
                  : `${summary.validSessions} verified of ${summary.sessions} session${summary.sessions === 1 ? "" : "s"}`
                : isVi
                  ? "Chưa có phiên hoàn thành hôm nay"
                  : "No completed sessions today"
            }
            icon={Timer}
            tone="accent"
          />
          <StatCard
            label={isVi ? "Tỉ lệ hợp lệ" : "Valid rate"}
            value={metrics.validRateValue}
            hint={
              isVi
                ? summary.sessions > 0
                  ? `${summary.validSessions} / ${summary.sessions} phiên đạt ngưỡng ${formatMinutes(workspace.settings.minValidFocusMinutes)}`
                  : "Chưa có phiên nào hôm nay"
                : metrics.validRateHint
            }
            icon={ShieldCheck}
            tone={metrics.validRateTone}
          />
          <StatCard
            label={isVi ? "Còn lại trong kế hoạch" : "Plan focus left"}
            value={
              isVi && metrics.planFocusLeftValue === "No plan"
                ? "Chưa có"
                : metrics.planFocusLeftValue
            }
            hint={
              isVi
                ? plan
                  ? metrics.planFocusRemaining > 0
                    ? `Còn cần ${formatMinutes(metrics.planFocusRemaining)} cho việc Bắt buộc`
                    : "Đã đạt mục tiêu tập trung của kế hoạch"
                  : "Tạo kế hoạch hôm nay để đặt mục tiêu"
                : metrics.planFocusLeftHint
            }
            icon={Clock3}
            tone={metrics.planFocusLeftTone}
          />
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          {plan && (plan.status === "draft" || plan.status === "confirmed") ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/25 bg-warning-soft px-4 py-3 text-[12px]">
              <p className="text-ink-soft">
                {isVi ? (
                  <>
                    Kế hoạch hôm nay vẫn đang ở trạng thái{" "}
                    <strong className="font-semibold">
                      {plan.status === "draft" ? "Bản nháp" : "Đã chốt"}
                    </strong>
                    {plan.progress.mustDoTotal === 0
                      ? " và chưa có việc Bắt buộc. Hãy thêm việc Bắt buộc trong Kế hoạch."
                      : ". Hãy kích hoạt để phiên tập trung được tính vào cổng ngày."}
                  </>
                ) : (
                  <>
                    Today&apos;s plan is still <strong className="font-semibold">{plan.status}</strong>
                    {plan.progress.mustDoTotal === 0
                      ? " with no Must-do tasks yet. Add Must-dos in Planner to lock today's gate."
                      : ". Activate it so verified focus counts toward today's gate."}
                  </>
                )}
              </p>
              {plan.status === "draft" && plan.progress.mustDoTotal > 0 ? (
                <ActionButton
                  action={confirmAndActivatePlanAction.bind(null, plan.id)}
                  variant="primary"
                  size="sm"
                >
                  {isVi ? "Xác nhận & kích hoạt" : "Confirm & activate"}
                </ActionButton>
              ) : plan.status === "confirmed" ? (
                <ActionButton
                  action={activatePlanAction.bind(null, plan.id)}
                  variant="primary"
                  size="sm"
                >
                  {isVi ? "Kích hoạt tập trung" : "Activate focus"}
                </ActionButton>
              ) : (
                <Link
                  href="/planner"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  {isVi ? "Mở Kế hoạch" : "Open planner"} <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          ) : null}

          {!active && readyToComplete.length > 0 ? (
            <div className="rounded-2xl border border-success/25 bg-success-soft px-4 py-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] font-semibold text-success">
                  {isVi
                    ? "Đã đủ thời gian tập trung — sẵn sàng đánh dấu hoàn thành"
                    : "Focus requirement met — ready to mark complete"}
                </p>
                <Link
                  href="/planner"
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-success hover:underline"
                >
                  {isVi ? "Mở Kế hoạch" : "Open Planner"} <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <div className="mt-2.5 space-y-2">
                {readyToComplete.map((task) => (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success/20 bg-surface px-3 py-2 text-[12px]"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{task.title}</p>
                      <p className="text-[11px] text-muted">
                        {formatMinutes(task.focusDone)} / {formatMinutes(task.requiredFocusMinutes)}{" "}
                        {isVi ? "tập trung hợp lệ" : "verified focus"}
                      </p>
                    </div>
                    <ActionButton
                      action={completePlanTaskAction.bind(null, task.id)}
                      variant="primary"
                      size="sm"
                    >
                      {isVi ? "Đánh dấu hoàn thành" : "Mark complete"}
                    </ActionButton>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {active ? (
            <FocusTimer session={active} minValidMinutes={workspace.settings.minValidFocusMinutes} />
          ) : (
            <FocusStarter
              candidates={candidates}
              minValidMinutes={workspace.settings.minValidFocusMinutes}
              initialTaskId={initialTaskId}
            />
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isVi ? "Cổng hôm nay" : "Today's gate"}</CardTitle>
              <Link href="/planner" className="text-[11px] font-medium text-accent hover:underline">
                {isVi ? "Kế hoạch" : "Plan"}
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {plan && metrics.gateConfigured ? (
                <>
                  {metrics.planFocusRequired > 0 ? (
                    <>
                      <div className="flex items-end justify-between gap-3">
                        <p className="font-display text-[30px] leading-none tabular-nums">
                          {formatMinutes(metrics.planFocusDone)}
                          <span className="font-sans text-[12px] text-muted">
                            {" "}
                            / {formatMinutes(metrics.planFocusRequired)}
                          </span>
                        </p>
                        <p className="text-[11px] text-muted">{isVi ? "được tính" : "credited"}</p>
                      </div>
                      <Progress
                        value={metrics.planFocusPercent}
                        tone={metrics.planFocusRemaining === 0 ? "success" : "accent"}
                        className="mt-3"
                      />
                    </>
                  ) : (
                    <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
                      <p className="text-[12.5px] font-semibold text-ink">
                        {isVi ? "Không yêu cầu phút tập trung" : "No focus minutes required"}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted">
                        {isVi
                          ? "Các việc Bắt buộc của bạn có yêu cầu tập trung là 0m."
                          : "Your Must-do tasks have a 0m focus requirement."}
                      </p>
                    </div>
                  )}
                  <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                    <li className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-muted">
                        {isVi ? "Việc Bắt buộc đã xong" : "Must-dos complete"}
                      </span>
                      <span className="font-medium tabular-nums">
                        {plan.progress.mustDoCompleted}/{plan.progress.mustDoTotal}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-muted">
                        {isVi ? "Việc Thưởng đã xong" : "Bonus done"}
                      </span>
                      <span className="font-medium tabular-nums">{plan.progress.bonusCompleted}</span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-muted">
                        {isVi ? "Tập trung còn lại" : "Focus remaining"}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMinutes(metrics.planFocusRemaining)}
                      </span>
                    </li>
                  </ul>
                  {plan.status === "active" &&
                  metrics.planFocusRequired > 0 &&
                  metrics.planFocusRemaining === 0 ? (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-[10.5px] leading-relaxed text-success">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />{" "}
                      {isVi
                        ? "Đã đạt mục tiêu tập trung. Hãy hoàn thành các việc Bắt buộc trong Kế hoạch để chốt ngày."
                        : "Focus target met. Complete the must-do tasks in the planner to close the day."}
                    </p>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-line bg-surface-2/40 p-4">
                  <p className="text-[13px] font-semibold text-ink">
                    {isVi ? "Chưa thiết lập cổng ngày" : metrics.gateTitle}
                  </p>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                    {isVi
                      ? "Tạo và xác nhận kế hoạch hôm nay để tính giờ tập trung vào phần thưởng."
                      : metrics.gateDescription}
                  </p>
                  <div className="mt-3">
                    <Link
                      href="/planner"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      {isVi ? "Mở Kế hoạch" : "Open Planner"} <ArrowRight className="size-3" />
                    </Link>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-accent" strokeWidth={1.8} />
                <p className="text-[12.5px] font-medium">
                  {isVi ? "Quy tắc tính điểm tập trung" : "Focus credit rules"}
                </p>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                {isVi ? (
                  <>
                    Một phiên được tính điểm khi kéo dài ít nhất{" "}
                    <span className="font-medium text-ink">
                      {formatMinutes(workspace.settings.minValidFocusMinutes)}
                    </span>{" "}
                    theo đồng hồ máy chủ. Cho phép làm quá giờ, nhưng số phút được cộng tối đa bằng{" "}
                    <span className="font-medium text-ink">2× thời lượng dự kiến</span> để tránh
                    quên tắt đồng hồ.
                  </>
                ) : (
                  <>
                    A session earns credit when it lasts at least{" "}
                    <span className="font-medium text-ink">
                      {formatMinutes(workspace.settings.minValidFocusMinutes)}
                    </span>{" "}
                    on the server clock. Overtime is allowed, and credited focus is capped at{" "}
                    <span className="font-medium text-ink">2× the planned block duration</span> so a
                    forgotten timer neither invalidates your work nor inflates reward time.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[13px] font-semibold">
              {isVi ? "Các phiên hôm nay" : "Today's sessions"}
            </h2>
            <p className="mt-0.5 text-[11px] text-muted">
              {isVi
                ? "Các phiên tập trung trong ngày kèm thời gian thực tế và thời gian hợp lệ được tính."
                : "Focus blocks from today with actual elapsed and verified credited duration."}
            </p>
          </div>
          <span className="text-[11px] text-muted">
            {isVi ? `Hiển thị ${sessions.length}` : `${sessions.length} shown`}
          </span>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <EmptyState
              icon={Timer}
              title={isVi ? "Hôm nay chưa có phiên nào" : "No sessions today"}
              description={
                isVi
                  ? "Bắt đầu phiên đầu tiên ở trên. Chỉ cần 25 phút tập trung thực sự cũng đủ tạo khác biệt."
                  : "Start the first block above. Even 25 honest minutes changes the shape of the day."
              }
              className="border-0 bg-transparent shadow-none"
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul>
              {sessions.map((session) => {
                const isRunning = session.status === "running" || session.status === "paused";
                const isCancelled = session.status === "cancelled";
                const isCapped =
                  session.status === "completed" &&
                  session.isValid &&
                  session.creditedMinutes < session.actualMinutes;

                return (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 sm:px-6"
                  >
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        isRunning
                          ? "bg-accent-soft text-accent"
                          : session.isValid
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning"
                      }`}
                    >
                      <Timer className="size-3.5" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-medium">
                        {session.taskTitle ?? (isVi ? "Tập trung tự do" : "Free focus")}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                        {formatTime(session.startedAt, timezone)} ·{" "}
                        {formatFocusModeLabel(session.mode)} ·{" "}
                        {isRunning
                          ? isVi
                            ? `Dự kiến ${session.plannedMinutes} phút · đang chạy`
                            : `${session.plannedMinutes} min planned · in progress`
                          : isCancelled
                            ? isVi ? "Đã hủy · 0 phút" : "Cancelled · 0 min credited"
                            : formatSessionDurationSummary(session)}
                      </p>
                    </div>
                    {isRunning ? (
                      <Badge tone="accent">{isVi ? "Đang chạy" : "In progress"}</Badge>
                    ) : isCancelled ? (
                      <Badge tone="neutral">{isVi ? "Đã hủy" : "Cancelled"}</Badge>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {isCapped ? (
                          <Badge tone="neutral">
                            {isVi ? "Áp dụng trần 2×" : "2× cap applied"}
                          </Badge>
                        ) : null}
                        <Badge tone={session.isValid ? "success" : "warning"}>
                          {session.isValid
                            ? isVi ? "Hợp lệ" : "Verified"
                            : isVi ? "Dưới tối thiểu" : "Below minimum"}
                        </Badge>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>

      <SessionNotesCard items={focusNotes} />
    </div>
  );
}
