import Link from "next/link";
import { ArrowRight, Clock3, Wallet as WalletIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMinutes } from "@/lib/data/format";
import type { Wallet } from "@/lib/data/types";
import { summarizeWalletForDashboard } from "@/lib/domain/dashboard-state";

export function RewardWalletCard({
  wallet,
  timezone,
}: {
  wallet: Wallet;
  timezone: string;
}) {
  const {
    availableMinutes,
    earnedMinutes,
    consumedMinutes,
    expiredMinutes,
    activeGrants,
    expiredGrants,
    nextExpiringGrant,
  } = summarizeWalletForDashboard(wallet);

  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-accent-soft/60 blur-2xl" />

      <CardContent className="relative p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="label-xs text-muted">Reward wallet</p>
            <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <WalletIcon className="size-4" strokeWidth={1.8} />
            </span>
          </div>

          <div className="mt-3.5">
            <p className="font-display text-[48px] leading-none tracking-[-0.025em] tabular-nums">
              {formatMinutes(availableMinutes)}
            </p>
            <p className="mt-2 text-[13.5px] font-medium text-ink">
              Available leisure time
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
              Earned by completing daily Must-do gates with verified focus.
            </p>
          </div>

          {/* Authoritative Ledger Breakdown */}
          <dl className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">Earned</dt>
              <dd className="mt-1 text-[14px] font-semibold tabular-nums">
                {formatMinutes(earnedMinutes)}
              </dd>
            </div>
            <div className="rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">Spent</dt>
              <dd className="mt-1 text-[14px] font-semibold tabular-nums">
                {formatMinutes(consumedMinutes)}
              </dd>
            </div>
            <div className="rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">Expired</dt>
              <dd className="mt-1 text-[14px] font-semibold text-ink-soft tabular-nums">
                {formatMinutes(expiredMinutes)}
              </dd>
            </div>
          </dl>

          {/* Grant Status / Next Expiration Window — No duplicate labels when empty */}
          {nextExpiringGrant ? (
            <div className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
                  <Clock3 className="size-3.5" /> Next expiration
                </span>
                <Badge tone="success">
                  {activeGrants.length} active grant{activeGrants.length === 1 ? "" : "s"}
                </Badge>
              </div>
              <p className="mt-1.5 text-[13px] font-medium text-ink tabular-nums">
                {formatMinutes(nextExpiringGrant.remainingMinutes)} ·{" "}
                <span className="font-normal text-ink-soft">
                  {formatDate(
                    nextExpiringGrant.expiresAt,
                    {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                    timezone,
                  )}
                </span>
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
              <p className="text-[12.5px] font-semibold text-ink">No active grants.</p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                {expiredGrants.length > 0
                  ? "Previous rewards have expired. Complete today's plan to earn a fresh grant."
                  : "Complete today's plan to earn your first leisure grant."}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-3.5">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline"
          >
            View wallet history <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
