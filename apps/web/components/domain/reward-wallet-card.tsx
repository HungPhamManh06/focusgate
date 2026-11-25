import Link from "next/link";
import { ArrowRight, Clock3, Lock, Ticket, Wallet as WalletIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatMinutes } from "@/lib/data/format";
import type { Wallet } from "@/lib/data/types";
import { summarizeWalletForDashboard } from "@/lib/domain/dashboard-state";
import { cn } from "@/lib/utils";

export function RewardWalletCard({
  wallet,
  timezone,
  locale = "en",
}: {
  wallet: Wallet;
  timezone: string;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const {
    availableMinutes,
    earnedMinutes,
    consumedMinutes,
    expiredMinutes,
    activeGrants,
    expiredGrants,
    nextExpiringGrant,
  } = summarizeWalletForDashboard(wallet);

  const isUnlocked = availableMinutes > 0;

  return (
    <Card
      className={cn(
        "relative overflow-hidden transition-colors",
        isUnlocked &&
          "border-success/35 bg-gradient-to-br from-success-soft/55 via-surface to-warning-soft/35",
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute -right-12 -top-16 size-48 rounded-full blur-2xl",
          isUnlocked ? "bg-success/20" : "bg-accent-soft/60",
        )}
      />

      {/* Ticket notch cutouts when unlocked */}
      {isUnlocked ? (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-2.5 top-[52%] size-5 -translate-y-1/2 rounded-full border border-success/30 bg-canvas"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -right-2.5 top-[52%] size-5 -translate-y-1/2 rounded-full border border-success/30 bg-canvas"
          />
        </>
      ) : null}

      <CardContent className="relative p-5 sm:p-6">
        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className={cn("label-xs", isUnlocked ? "text-success" : "text-muted")}>
                {isUnlocked
                  ? isVi
                    ? "Vé tự do · Đã mở khóa"
                    : "Leisure pass · Unlocked"
                  : isVi
                    ? "Ví thưởng"
                    : "Reward wallet"}
              </p>
            </div>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-xl",
                isUnlocked
                  ? "bg-success text-white shadow-sm"
                  : "bg-accent-soft text-accent",
              )}
            >
              {isUnlocked ? (
                <Ticket className="size-4" strokeWidth={1.9} />
              ) : (
                <WalletIcon className="size-4" strokeWidth={1.8} />
              )}
            </span>
          </div>

          <div className="mt-3.5">
            <div className="flex items-baseline gap-2.5">
              <p
                className={cn(
                  "font-display text-[48px] leading-none tracking-[-0.025em] tabular-nums",
                  isUnlocked && "text-success",
                )}
              >
                {formatMinutes(availableMinutes)}
              </p>
              {isUnlocked ? (
                <Badge tone="success">
                  {isVi ? "Chơi không áy náy" : "Guilt-free"}
                </Badge>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-muted">
                  <Lock className="size-2.5" /> {isVi ? "Đang khóa" : "Locked"}
                </span>
              )}
            </div>
            <p className="mt-2 text-[13.5px] font-medium text-ink">
              {isUnlocked
                ? isVi
                  ? "Thời gian giải trí bạn đã tự kiếm được"
                  : "Earned leisure time ready to enjoy"
                : isVi
                  ? "Thời gian giải trí khả dụng"
                  : "Available leisure time"}
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">
              {isVi
                ? "Nhận được khi hoàn thành cổng Bắt buộc hằng ngày với các phiên tập trung hợp lệ."
                : "Earned by completing daily Must-do gates with verified focus."}
            </p>
          </div>

          {/* Perforated ticket divider when unlocked */}
          <div
            className={cn(
              "my-4 border-t",
              isUnlocked ? "border-dashed border-success/35" : "border-line/80",
            )}
          />

          {/* Authoritative Ledger Breakdown */}
          <dl className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-line/80 bg-surface/80 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">{isVi ? "Đã nhận" : "Earned"}</dt>
              <dd className="mt-1 text-[14px] font-semibold tabular-nums">
                {formatMinutes(earnedMinutes)}
              </dd>
            </div>
            <div className="rounded-xl border border-line/80 bg-surface/80 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">{isVi ? "Đã dùng" : "Spent"}</dt>
              <dd className="mt-1 text-[14px] font-semibold tabular-nums">
                {formatMinutes(consumedMinutes)}
              </dd>
            </div>
            <div className="rounded-xl border border-line/80 bg-surface/80 px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">{isVi ? "Hết hạn" : "Expired"}</dt>
              <dd className="mt-1 text-[14px] font-semibold text-ink-soft tabular-nums">
                {formatMinutes(expiredMinutes)}
              </dd>
            </div>
          </dl>

          {/* Grant Status / Next Expiration Window */}
          {nextExpiringGrant ? (
            <div className="mt-4 rounded-xl border border-success/25 bg-surface/90 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-muted">
                  <Clock3 className="size-3.5 text-success" />{" "}
                  {isVi ? "Hết hạn tiếp theo" : "Next expiration"}
                </span>
                <Badge tone="success">
                  {isVi
                    ? `${activeGrants.length} gói đang hiệu lực`
                    : `${activeGrants.length} active grant${activeGrants.length === 1 ? "" : "s"}`}
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
                    locale,
                  )}
                </span>
              </p>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-line bg-surface-2/60 px-3.5 py-3">
              <p className="text-[12.5px] font-semibold text-ink">
                {isVi ? "Không có phần thưởng đang hiệu lực." : "No active grants."}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                {expiredGrants.length > 0
                  ? isVi
                    ? "Các phần thưởng trước đã hết hạn. Hoàn thành kế hoạch hôm nay để nhận thưởng mới."
                    : "Previous rewards have expired. Complete today's plan to earn a fresh grant."
                  : isVi
                    ? "Hoàn thành kế hoạch hôm nay để nhận phần thưởng đầu tiên."
                    : "Complete today's plan to earn your first leisure grant."}
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 border-t border-line pt-3.5">
          <Link
            href="/wallet"
            className={cn(
              "inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline",
              isUnlocked ? "text-success" : "text-accent",
            )}
          >
            {isVi ? "Xem lịch sử ví" : "View wallet history"} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
