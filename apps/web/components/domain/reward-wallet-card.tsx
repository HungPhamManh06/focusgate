import Link from "next/link";
import { ArrowRight, Clock3, Wallet as WalletIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMinutes } from "@/lib/data/format";
import type { Wallet } from "@/lib/data/types";

export function RewardWalletCard({
  wallet,
  timezone,
}: {
  wallet: Wallet;
  timezone: string;
}) {
  const now = new Date();
  const activeGrants = wallet.grants
    .filter((grant) => grant.status === "active" && new Date(grant.expiresAt) > now)
    .sort((a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime());

  const nextExpiringGrant = activeGrants[0];

  // Authoritative sum of unspent minutes on grants that have already expired.
  // Never inferred by subtracting spent from earned.
  const expiredGrants = wallet.grants.filter(
    (grant) =>
      grant.status === "expired" ||
      (grant.status === "active" && new Date(grant.expiresAt) <= now),
  );
  const expiredMinutes = expiredGrants.reduce((sum, grant) => sum + grant.remainingMinutes, 0);

  return (
    <Card className="relative flex flex-col justify-between overflow-hidden">
      <div className="pointer-events-none absolute -right-12 -top-16 size-44 rounded-full bg-accent-soft/60 blur-2xl" />

      <CardContent className="relative flex flex-1 flex-col justify-between p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-2">
            <p className="label-xs text-muted">Reward wallet</p>
            <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <WalletIcon className="size-4" strokeWidth={1.8} />
            </span>
          </div>

          <div className="mt-4">
            <p className="font-display text-[48px] leading-none tracking-[-0.025em] tabular-nums">
              {formatMinutes(wallet.availableMinutes)}
            </p>
            <p className="mt-2 text-[12.5px] font-medium text-ink-soft">
              Available leisure time
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
              Earned by completing daily Must-do gates with verified focus.
            </p>
          </div>

          {/* Authoritative Ledger Breakdown */}
          <dl className="mt-5 grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5">
              <dt className="text-[10.5px] text-muted">Earned</dt>
              <dd className="mt-1 text-[13.5px] font-semibold tabular-nums">
                {formatMinutes(wallet.earnedMinutes)}
              </dd>
            </div>
            <div className="rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5">
              <dt className="text-[10.5px] text-muted">Spent</dt>
              <dd className="mt-1 text-[13.5px] font-semibold tabular-nums">
                {formatMinutes(wallet.consumedMinutes)}
              </dd>
            </div>
            <div className="rounded-xl border border-line/80 bg-surface-2 px-3 py-2.5">
              <dt className="text-[10.5px] text-muted">Expired</dt>
              <dd className="mt-1 text-[13.5px] font-semibold text-muted tabular-nums">
                {formatMinutes(expiredMinutes)}
              </dd>
            </div>
          </dl>

          {/* Next Expiration Window */}
          <div className="mt-4 rounded-xl border border-line bg-surface px-3.5 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
                <Clock3 className="size-3.5" /> Next expiration
              </span>
              {activeGrants.length > 0 ? (
                <Badge tone="success">
                  {activeGrants.length} active grant{activeGrants.length === 1 ? "" : "s"}
                </Badge>
              ) : (
                <Badge tone="neutral">No active grants</Badge>
              )}
            </div>

            {nextExpiringGrant ? (
              <p className="mt-1.5 text-[12.5px] font-medium text-ink tabular-nums">
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
            ) : expiredGrants.length > 0 ? (
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                Previous grants have expired. Complete today&apos;s plan to earn a fresh grant.
              </p>
            ) : (
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                No active grants yet. Finish today&apos;s Must-do tasks to unlock your first reward block.
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <Link
            href="/wallet"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:underline"
          >
            View wallet history <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
