import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  Wallet as WalletIcon,
} from "lucide-react";
import { claimRewardAction } from "@/lib/actions/rewards";
import { ActionButton } from "@/components/ui/action-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/ui/stat-card";
import {
  formatDate,
  formatDurationSeconds,
  formatMinutes,
  formatTime,
} from "@/lib/data/format";
import { getTodayPlan } from "@/lib/data/planner";
import { getWallet } from "@/lib/data/rewards";
import { getWorkspace } from "@/lib/data/workspace";
import { SpendForm } from "./spend-form";

export const dynamic = "force-dynamic";

const sourceLabels: Record<string, string> = {
  daily_plan_base: "Daily plan reward",
  manual: "Manual adjustment",
  device_revoked: "Device revoked",
};

const reasonLabels: Record<string, string> = {
  grant: "Reward earned",
  grant_created: "Reward earned",
  consume: "Entertainment time",
  spend: "Entertainment time",
  expired: "Grant expired",
  adjustment: "Adjustment",
  revoke: "Device revoked",
};

function humanize(value: string): string {
  return reasonLabels[value] ?? value.replaceAll("_", " ");
}

export default async function WalletPage() {
  const [workspace, wallet, plan] = await Promise.all([
    getWorkspace(),
    getWallet(),
    getTodayPlan(),
  ]);
  const { timezone } = workspace.profile;

  const activeGrants = wallet.grants.filter(
    (grant) => grant.status === "active" && new Date(grant.expiresAt) > new Date(),
  );
  const expiringSoon = activeGrants.filter(
    (grant) => new Date(grant.expiresAt).getTime() - Date.now() < 12 * 60 * 60 * 1000,
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Reward wallet"
        title="Earned, not given."
        description="Focused work buys real leisure time. Spend it deliberately, and let the balance stay honest."
        actions={
          <>
            <Link href="/statistics" className={buttonVariants({ variant: "ghost", size: "md" })}>
              <History className="size-4" /> History
            </Link>
            <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
              <CalendarClock className="size-4" /> Today&apos;s plan
            </Link>
          </>
        }
      />

      {plan?.status === "completed" ? (
        <div className="mt-7 flex flex-col gap-3 rounded-[18px] border border-accent/25 bg-accent-soft/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium">Today&apos;s gate is complete.</p>
              <p className="mt-0.5 text-[12px] text-muted">
                Claim the daily reward to add the earned minutes to your wallet.
              </p>
            </div>
          </div>
          <ActionButton action={claimRewardAction.bind(null, plan.id)} variant="accent" size="sm">
            Claim reward
          </ActionButton>
        </div>
      ) : plan?.status === "active" ? (
        <div className="mt-7 flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <Timer className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium">Today&apos;s reward is still locked.</p>
              <p className="mt-0.5 text-[12px] text-muted">
                {plan.progress.mustDoTotal > 0
                  ? `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} must-dos complete · ${formatMinutes(plan.progress.focusDone)} of ${formatMinutes(plan.progress.focusRequired)} focus verified.`
                  : "No Must-dos configured for today's gate yet."}
              </p>
            </div>
          </div>
          <Link href="/focus" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Go to focus <ArrowRight className="size-3" />
          </Link>
        </div>
      ) : (
        <div className="mt-7 flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-muted">
              <CalendarClock className="size-4" />
            </span>
            <div>
              <p className="text-[12.5px] font-medium">
                {plan ? "Today's plan is waiting to start." : "No plan for today yet."}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {plan
                  ? "Confirm and activate the plan to begin earning today's reward."
                  : "Plan the must-dos first; the wallet is funded by finished work."}
              </p>
            </div>
          </div>
          <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Open planner <ArrowRight className="size-3" />
          </Link>
        </div>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Available now"
          value={formatMinutes(wallet.availableMinutes)}
          hint={`${activeGrants.length} active grant${activeGrants.length === 1 ? "" : "s"}${
            expiringSoon.length > 0 ? ` · ${expiringSoon.length} expiring soon` : ""
          }`}
          icon={WalletIcon}
          tone="accent"
        />
        <StatCard
          label="Earned all time"
          value={formatMinutes(wallet.earnedMinutes)}
          hint="From completed daily plans"
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Spent all time"
          value={formatMinutes(wallet.consumedMinutes)}
          hint="Logged entertainment time"
          icon={TrendingDown}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Active grants</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  Each grant expires on its own clock. Use it before it disappears.
                </p>
              </div>
              <Badge tone="success">{activeGrants.length} open</Badge>
            </CardHeader>
            <CardContent className="pt-4">
              {activeGrants.length === 0 ? (
                <EmptyState
                  icon={WalletIcon}
                  title="No active grants"
                  description="Complete a daily plan and claim its reward to open your next block of earned time."
                  action={
                    <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Plan today <ArrowRight className="size-3" />
                    </Link>
                  }
                  className="px-5 py-7"
                />
              ) : (
                <ul className="space-y-4">
                  {activeGrants.map((grant) => {
                    const usedPercent =
                      grant.grantedMinutes > 0
                        ? Math.round((grant.consumedMinutes / grant.grantedMinutes) * 100)
                        : 0;
                    return (
                      <li key={grant.id} className="rounded-xl border border-line px-4 py-3.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-[12.5px] font-medium">
                              {sourceLabels[grant.source] ?? humanize(grant.source)}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted">
                              Expires{" "}
                              {formatDate(
                                grant.expiresAt,
                                { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                                timezone,
                              )}
                            </p>
                          </div>
                          <p className="font-display text-[24px] leading-none">
                            {formatMinutes(grant.remainingMinutes)}
                            <span className="ml-1 font-sans text-[10px] text-muted">left</span>
                          </p>
                        </div>
                        <Progress
                          value={100 - usedPercent}
                          tone={usedPercent > 70 ? "warning" : "accent"}
                          className="mt-3"
                        />
                        <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                          <span>{formatMinutes(grant.consumedMinutes)} spent</span>
                          <span>{formatMinutes(grant.grantedMinutes)} granted</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Ledger</CardTitle>
                <p className="mt-1 text-[12px] text-muted">Every change to your balance, in order.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {wallet.ledger.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No ledger entries"
                  description="Earning or spending minutes will show here with an audit trail."
                  className="px-5 py-7"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {wallet.ledger.map((entry) => {
                    const positive = entry.deltaMinutes > 0;
                    return (
                      <li key={entry.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span
                          className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                            positive ? "bg-success-soft text-success" : "bg-surface-2 text-muted"
                          }`}
                        >
                          {positive ? (
                            <TrendingUp className="size-3.5" />
                          ) : (
                            <TrendingDown className="size-3.5" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium">{humanize(entry.reason)}</p>
                          <p className="mt-0.5 text-[10.5px] text-muted">
                            {formatDate(
                              entry.createdAt,
                              { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                              timezone,
                            )}
                            {entry.note ? ` · ${entry.note}` : ""}
                          </p>
                        </div>
                        <span
                          className={`text-[12px] font-semibold ${
                            positive ? "text-success" : "text-ink-soft"
                          }`}
                        >
                          {positive ? "+" : "−"}
                          {formatMinutes(Math.abs(entry.deltaMinutes))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Spend time</CardTitle>
                <p className="mt-1 text-[12px] text-muted">Turn earned minutes into a real break.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <SpendForm grants={activeGrants} timezone={timezone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent usage</CardTitle>
              <Clock3 className="size-4 text-muted" strokeWidth={1.8} />
            </CardHeader>
            <CardContent className="pt-4">
              {wallet.usage.length === 0 ? (
                <EmptyState
                  icon={Clock3}
                  title="Nothing spent yet"
                  description="Logged entertainment time will appear here."
                  className="px-5 py-7"
                />
              ) : (
                <ul className="space-y-3">
                  {wallet.usage.map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-medium">{event.displayName}</p>
                        <p className="mt-0.5 text-[10.5px] text-muted">
                          {formatDate(
                            event.startedAt,
                            { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                            timezone,
                          )}
                        </p>
                      </div>
                      <span className="shrink-0 text-[11px] font-medium">
                        {formatDurationSeconds(event.durationSeconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                <p className="text-[12.5px] font-medium">The rule of the gate</p>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                Minutes are only earned by completed plans with verified focus. Spending is logged
                against the grant — no hidden math, no infinite scroll.
              </p>
              <p className="mt-3 text-[10.5px] text-muted">
                Time zone: {timezone} · Grants expire at 04:00 local time.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-[10.5px] text-muted">
        <Timer className="size-3" /> Balance is computed from the reward ledger, not stored by the
        browser.
      </p>
    </div>
  );
}
