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
} from "@/lib/actions/planner";
import { claimRewardAction } from "@/lib/actions/rewards";
import { ActionButton } from "@/components/ui/action-button";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { KindBadge, PlanStatusBadge, kindDescriptions, kindLabels } from "@/components/domain/labels";
import { formatDateLong, formatMinutes, formatTime, todayIso } from "@/lib/data/format";
import { buildPlannerSummaryViewModel } from "@/lib/domain/tasks-planner-state";
import { getPlannerBacklog, getTodayPlan } from "@/lib/data/planner";
import { getWorkspace } from "@/lib/data/workspace";
import type { Plan, PlanStatus, TaskKind } from "@/lib/data/types";
import { cn } from "@/lib/utils";
import { AddPlanTask } from "./add-plan-task";
import { PlanTaskRow } from "./plan-task-row";

export const dynamic = "force-dynamic";

const kindOrder: TaskKind[] = ["must_do", "should_do", "bonus"];

const steps: { status: Exclude<PlanStatus, "cancelled">; label: string; hint: string }[] = [
  { status: "draft", label: "Draft", hint: "Choose tasks and focus targets" },
  { status: "confirmed", label: "Confirm", hint: "Lock the gate for the day" },
  { status: "active", label: "Focus", hint: "Log verified sessions" },
  { status: "completed", label: "Complete", hint: "Claim the earned reward" },
];

function EventLabel({ eventType }: { eventType: string }) {
  const label = eventType
    .split("_")
    .map((part, index) => (index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
  return <>{label}</>;
}

function PlanStepper({ plan }: { plan: Plan }) {
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
              <p className={cn("text-[12px] font-medium", current && "text-accent")}>{step.label}</p>
            </div>
            <p className="mt-1.5 hidden pl-7 text-[10.5px] leading-snug text-muted sm:block">
              {step.hint}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default async function PlannerPage() {
  const [workspace, plan] = await Promise.all([getWorkspace(), getTodayPlan()]);
  const backlog = await getPlannerBacklog(plan?.id ?? null);
  const { timezone, displayName } = workspace.profile;
  const today = todayIso(timezone);
  const planDate = plan?.planDate ?? today;
  const dateLabel = formatDateLong(`${planDate}T12:00:00Z`, timezone);

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
        title="The day, decided in advance."
        description={`Plan for ${displayName.split(/\s+/)[0] ?? displayName}. Commit to a small number of must-dos, then let verified focus carry the rest.`}
        actions={
          <Link href="/tasks" className={buttonVariants({ variant: "outline", size: "md" })}>
            <ListTodo className="size-4" /> Manage tasks
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
                No plan for today. Yet.
              </h2>
              <p className="mt-3 max-w-md text-[13px] leading-relaxed text-muted">
                A plan turns intention into a gate: every must-do needs real focus, and finishing the
                day is what unlocks your reward minutes.
              </p>
              <div className="mt-6">
                <ActionButton action={createPlanAction} variant="accent" size="lg">
                  <Sparkles className="size-4" /> Create today&apos;s plan
                </ActionButton>
              </div>
            </div>
            <div className="grid border-t border-line sm:grid-cols-2">
              {[
                { icon: Target, title: "Pick must-dos", copy: "Aim for 1–3. These decide whether the day counts." },
                { icon: Clock3, title: "Set focus targets", copy: "Minutes that must be verified by real sessions." },
                { icon: Lock, title: "Confirm the gate", copy: "No more editing. The plan becomes a contract." },
                { icon: Wallet, title: "Earn the reward", copy: "Finish the day, unlock intentional entertainment time." },
              ].map((item) => (
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
                <CardTitle>Backlog ready</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  {backlog.length} open task{backlog.length === 1 ? "" : "s"} waiting.
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {backlog.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title="Nothing in the backlog"
                  description="Create tasks first, then come back and choose the day."
                  action={
                    <Link href="/tasks" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Add tasks
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
                      <KindBadge kind={task.kind} />
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
            <PlanStatusBadge status={plan.status} />
            <span className="text-[11.5px] text-muted">{summary?.headerMetaLine}</span>
          </div>

          <div className="mt-4">
            <PlanStepper plan={plan} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              {plan.tasks.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={Sparkles}
                    title="This plan has no tasks"
                    description={
                      plan.status === "draft"
                        ? "Add a few must-dos from the backlog to give the day a spine."
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
                            <h2 className="text-[13px] font-semibold">{kindLabels[kind]}</h2>
                            <KindBadge kind={kind} />
                          </div>
                          <p className="mt-1 text-[11px] text-muted">{kindDescriptions[kind]}</p>
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

              {plan.status === "draft" ? (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Add from backlog</CardTitle>
                      <p className="mt-1 text-[12px] text-muted">
                        {backlog.length} open task{backlog.length === 1 ? "" : "s"} not in this plan.
                      </p>
                    </div>
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
                      <CardTitle>Gate history</CardTitle>
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
                              <EventLabel eventType={event.eventType} />
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
                  <CardTitle>Gate summary</CardTitle>
                  <PlanStatusBadge status={plan.status} />
                </CardHeader>
                <CardContent className="pt-5">
                  <div className="flex items-end justify-between gap-2">
                    <div>
                      <p className="label-xs text-muted">Must-do progress</p>
                      <p
                        className={cn(
                          "mt-2 font-display leading-none",
                          summary?.hasMustDos ? "text-[36px]" : "text-[24px] text-muted",
                        )}
                      >
                        {summary?.mustDoHeadline}
                      </p>
                    </div>
                    <p className="pb-1 text-[11.5px] text-muted">{summary?.mustDoCountLabel}</p>
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
                        <Timer className="size-3.5" /> Focus done
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
                        <Target className="size-3.5" /> Focus coverage
                      </dt>
                      <dd className="text-[12px] font-medium">{summary?.focusCoverageLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Clock3 className="size-3.5" /> Total plan focus
                      </dt>
                      <dd className="text-[12px] font-medium">{summary?.totalPlanFocusLabel}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Sparkles className="size-3.5" /> Bonus completed
                      </dt>
                      <dd className="text-[12px] font-medium">{plan.progress.bonusCompleted}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="flex items-center gap-2 text-[11.5px] text-muted">
                        <Wallet className="size-3.5" /> Est. reward
                      </dt>
                      <dd className="text-[12px] font-medium">{formatMinutes(rewardEstimate)}</dd>
                    </div>
                  </dl>

                  <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[10.5px] leading-relaxed text-muted">
                    Base {formatMinutes(workspace.settings.baseMinutes)} +{" "}
                    {formatMinutes(workspace.settings.bonusMinutesPerTask)} per bonus, capped at{" "}
                    {formatMinutes(workspace.settings.dailyCapMinutes)}. Valid focus needs at least{" "}
                    {formatMinutes(workspace.settings.minValidFocusMinutes)}.
                  </p>

                  {summary?.isOverloaded ? (
                    <p className="mt-3 rounded-xl border border-warning/25 bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
                      Heavy commitment ({summary.totalPlanFocusLabel} required focus). Consider moving
                      non-essential tasks out if 6h+ is unrealistic today.
                    </p>
                  ) : null}

                  <div className="mt-5 space-y-2">
                    {plan.status === "draft" ? (
                      <>
                        <ActionButton
                          action={confirmAndActivatePlanAction.bind(null, plan.id)}
                          variant="accent"
                          className="w-full"
                          confirmTitle="Confirm & start today's gate?"
                          confirmMessage="Confirming locks today's plan as a contract and activates verified focus immediately. Amendments afterward are logged in Gate History."
                          confirmLabel="Confirm & start plan"
                          disabled={plan.progress.mustDoTotal === 0}
                          pendingLabel="Starting…"
                        >
                          <Lock className="size-4" /> Confirm &amp; start plan
                        </ActionButton>
                        {plan.progress.mustDoTotal === 0 ? (
                          <p className="text-center text-[10.5px] text-muted">
                            Add at least one must-do to confirm.
                          </p>
                        ) : null}
                      </>
                    ) : null}

                    {plan.status === "confirmed" ? (
                      <ActionButton
                        action={activatePlanAction.bind(null, plan.id)}
                        variant="accent"
                        className="w-full"
                      >
                        <Timer className="size-4" /> Activate focus
                      </ActionButton>
                    ) : null}

                    {plan.status === "active" ? (
                      <>
                        <Link
                          href="/focus"
                          className={buttonVariants({ variant: "accent", size: "md", className: "w-full" })}
                        >
                          <Timer className="size-4" /> Start a focus block
                        </Link>
                        <ActionButton
                          action={completePlanAction.bind(null, plan.id)}
                          variant="outline"
                          className="w-full"
                          confirmTitle="Close today's plan?"
                          confirmMessage="Every Must-Do task needs verified focus first. Once closed, your reward grant is ready to claim."
                          confirmLabel="Complete day"
                        >
                          Complete day
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
                          <Sparkles className="size-4" /> Claim reward
                        </ActionButton>
                        <Link
                          href="/wallet"
                          className={buttonVariants({ variant: "outline", size: "md", className: "w-full" })}
                        >
                          Open wallet <ArrowRight className="size-3.5" />
                        </Link>
                      </>
                    ) : null}
                  </div>

                  {mustDoTasks.length > 0 ? (
                    <p className="mt-4 text-center text-[10.5px] leading-relaxed text-muted">
                      {mustDoTasks.filter((task) => task.completedAt).length} of {mustDoTasks.length}{" "}
                      must-dos complete.
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
