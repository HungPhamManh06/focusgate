import Link from "next/link";
import { ArrowRight, CalendarClock, CheckCircle2, Clock3, ShieldCheck, Timer, Wallet } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { formatMinutes, formatTime } from "@/lib/data/format";
import {
  getActiveSession,
  getFocusCandidates,
  getTodayFocusSummary,
  getTodaySessions,
} from "@/lib/data/focus";
import { getTodayPlan } from "@/lib/data/planner";
import { getWorkspace } from "@/lib/data/workspace";
import { FocusStarter } from "./focus-starter";
import { FocusTimer } from "./focus-timer";

export const dynamic = "force-dynamic";

export default async function FocusPage() {
  const [workspace, active, candidates, sessions, summary, plan] = await Promise.all([
    getWorkspace(),
    getActiveSession(),
    getFocusCandidates(),
    getTodaySessions(10),
    getTodayFocusSummary(),
    getTodayPlan(),
  ]);

  const { timezone } = workspace.profile;
  const validRate =
    summary.sessions > 0 ? Math.round((summary.validSessions / summary.sessions) * 100) : 0;
  const planFocusRemaining = plan
    ? Math.max(0, plan.progress.focusRequired - plan.progress.focusDone)
    : 0;

  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Focus mode"
        title={active ? "The gate is open." : "Protect the next hour."}
        description={
          active
            ? "One session at a time. The clock is running; end it when the work is genuinely done."
            : "A block only counts when it is long enough and tied to real work. Choose one thing and begin."
        }
        actions={
          <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
            <CalendarClock className="size-4" /> Today&apos;s plan
          </Link>
        }
      />

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Focus today"
          value={formatMinutes(summary.minutes)}
          hint={`${summary.validSessions} valid of ${summary.sessions} sessions`}
          icon={Timer}
          tone="accent"
        />
        <StatCard
          label="Valid rate"
          value={`${validRate}%`}
          hint={`Minimum ${formatMinutes(workspace.settings.minValidFocusMinutes)} per session`}
          icon={ShieldCheck}
          tone={validRate >= 80 ? "success" : "default"}
        />
        <StatCard
          label="Plan focus left"
          value={plan ? formatMinutes(planFocusRemaining) : "—"}
          hint={plan ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} must-dos done` : "No plan today"}
          icon={Clock3}
          tone={planFocusRemaining === 0 && plan ? "success" : "default"}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div>
          {active ? (
            <FocusTimer session={active} minValidMinutes={workspace.settings.minValidFocusMinutes} />
          ) : (
            <FocusStarter
              candidates={candidates}
              minValidMinutes={workspace.settings.minValidFocusMinutes}
            />
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Today&apos;s gate</CardTitle>
              <Link href="/planner" className="text-[11px] font-medium text-accent hover:underline">
                Plan
              </Link>
            </CardHeader>
            <CardContent className="pt-4">
              {plan ? (
                <>
                  <div className="flex items-end justify-between gap-3">
                    <p className="font-display text-[30px] leading-none">
                      {formatMinutes(plan.progress.focusDone)}
                      <span className="font-sans text-[12px] text-muted">
                        {" "}
                        / {formatMinutes(plan.progress.focusRequired)}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted">verified</p>
                  </div>
                  <Progress
                    value={
                      plan.progress.focusRequired > 0
                        ? Math.min(100, Math.round((plan.progress.focusDone / plan.progress.focusRequired) * 100))
                        : 0
                    }
                    tone={planFocusRemaining === 0 ? "success" : "accent"}
                    className="mt-3"
                  />
                  <ul className="mt-4 space-y-2.5 border-t border-line pt-4">
                    <li className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-muted">Must-dos complete</span>
                      <span className="font-medium">
                        {plan.progress.mustDoCompleted}/{plan.progress.mustDoTotal}
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-muted">Bonus done</span>
                      <span className="font-medium">{plan.progress.bonusCompleted}</span>
                    </li>
                    <li className="flex items-center justify-between gap-3 text-[11.5px]">
                      <span className="text-muted">Focus remaining</span>
                      <span className="font-medium">{formatMinutes(planFocusRemaining)}</span>
                    </li>
                  </ul>
                  {plan.status === "active" && planFocusRemaining === 0 ? (
                    <p className="mt-4 flex items-start gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-[10.5px] leading-relaxed text-success">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> Focus target met. Complete the
                      must-do tasks in the planner to close the day.
                    </p>
                  ) : null}
                </>
              ) : (
                <EmptyState
                  icon={CalendarClock}
                  title="No plan today"
                  description="Focus still counts, but a plan gives the minutes a destination."
                  action={
                    <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Create a plan <ArrowRight className="size-3" />
                    </Link>
                  }
                  className="border-0 bg-transparent px-0 py-0"
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <Wallet className="size-4 text-accent" strokeWidth={1.8} />
                <p className="text-[12.5px] font-medium">Why the minimum?</p>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                A session only counts toward your plan when it lasts at least{" "}
                {formatMinutes(workspace.settings.minValidFocusMinutes)}. Ending early is allowed — it
                simply does not buy reward time.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <section className="mt-6">
        <div className="mb-2 flex items-end justify-between gap-3 px-1">
          <div>
            <h2 className="text-[13px] font-semibold">Today&apos;s sessions</h2>
            <p className="mt-0.5 text-[11px] text-muted">Completed focus blocks from today.</p>
          </div>
          <span className="text-[11px] text-muted">{sessions.length} shown</span>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <EmptyState
              icon={Timer}
              title="No sessions today"
              description="Start the first block above. Even 25 honest minutes changes the shape of the day."
              className="border-0 bg-transparent shadow-none"
            />
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <ul>
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 sm:px-6"
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      session.isValid ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
                    }`}
                  >
                    <Timer className="size-3.5" strokeWidth={1.9} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium">
                      {session.taskTitle ?? "Free focus"}
                    </p>
                    <p className="mt-0.5 text-[10.5px] text-muted">
                      {formatTime(session.startedAt, timezone)} · {session.mode.replaceAll("_", " ")} ·{" "}
                      {session.actualMinutes} min
                    </p>
                  </div>
                  <Badge tone={session.isValid ? "success" : "warning"}>
                    {session.isValid ? "Valid" : "Below minimum"}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}
