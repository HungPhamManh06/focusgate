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
import { getV2Settings } from "@/lib/data/v2-settings";
import { EarnedTimeCard } from "./earned-time-card";
import { QuickRedeemVault } from "./quick-redeem-vault";
import { RewardWishlistCard } from "./reward-wishlist-card";
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
  const [workspace, wallet, plan, v2] = await Promise.all([
    getWorkspace(),
    getWallet(),
    getTodayPlan(),
    getV2Settings(),
  ]);
  const locale = v2.language;
  const isVi = locale === "vi";
  const { timezone } = workspace.profile;

  const sourceLabelsVi: Record<string, string> = {
    daily_plan_base: "Thưởng kế hoạch ngày",
    manual: "Điều chỉnh thủ công",
    device_revoked: "Thu hồi thiết bị",
  };
  const reasonLabelsVi: Record<string, string> = {
    grant: "Nhận thưởng",
    grant_created: "Nhận thưởng",
    consume: "Thời gian giải trí",
    spend: "Thời gian giải trí",
    expired: "Phần thưởng hết hạn",
    adjustment: "Điều chỉnh",
    revoke: "Thu hồi thiết bị",
  };
  const humanizeLocalized = (value: string) =>
    isVi ? (reasonLabelsVi[value] ?? humanize(value)) : humanize(value);

  const activeGrants = wallet.grants.filter(
    (grant) => grant.status === "active" && new Date(grant.expiresAt) > new Date(),
  );
  const expiringSoon = activeGrants.filter(
    (grant) => new Date(grant.expiresAt).getTime() - Date.now() < 12 * 60 * 60 * 1000,
  );

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={isVi ? "Ví thưởng" : "Reward wallet"}
        title={isVi ? "Tự làm, tự hưởng." : "Earned, not given."}
        description={
          isVi
            ? "Tập trung làm việc để đổi lấy thời gian giải trí thực thụ. Hãy sử dụng có chủ đích."
            : "Focused work buys real leisure time. Spend it deliberately, and let the balance stay honest."
        }
        actions={
          <>
            <Link href="/statistics" className={buttonVariants({ variant: "ghost", size: "md" })}>
              <History className="size-4" /> {isVi ? "Lịch sử" : "History"}
            </Link>
            <Link href="/planner" className={buttonVariants({ variant: "outline", size: "md" })}>
              <CalendarClock className="size-4" /> {isVi ? "Kế hoạch hôm nay" : "Today's plan"}
            </Link>
          </>
        }
      />

      <QuickRedeemVault
        grants={activeGrants}
        availableMinutes={wallet.availableMinutes}
        dailyCapMinutes={workspace.settings.dailyCapMinutes}
        earnedMinutes={wallet.earnedMinutes}
        spentMinutes={wallet.consumedMinutes}
      />

      <RewardWishlistCard availableMinutes={wallet.availableMinutes} />

      {plan?.status === "completed" ? (
        <div className="mt-7 flex flex-col gap-3 rounded-[18px] border border-accent/25 bg-accent-soft/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-accent">
              <Sparkles className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium">
                {isVi ? "Cổng hôm nay đã hoàn thành." : "Today's gate is complete."}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {isVi
                  ? "Nhận thưởng ngày để cộng số phút kiếm được vào ví."
                  : "Claim the daily reward to add the earned minutes to your wallet."}
              </p>
            </div>
          </div>
          <ActionButton action={claimRewardAction.bind(null, plan.id)} variant="accent" size="sm">
            {isVi ? "Nhận thưởng" : "Claim reward"}
          </ActionButton>
        </div>
      ) : plan?.status === "active" ? (
        <div className="mt-7 flex flex-col gap-3 rounded-[18px] border border-line bg-surface px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning">
              <Timer className="size-4" />
            </span>
            <div>
              <p className="text-[13px] font-medium">
                {isVi ? "Phần thưởng hôm nay vẫn đang khóa." : "Today's reward is still locked."}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {plan.progress.mustDoTotal > 0
                  ? isVi
                    ? `Đã xong ${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} việc Bắt buộc · ${formatMinutes(plan.progress.focusDone)} / ${formatMinutes(plan.progress.focusRequired)} tập trung.`
                    : `${plan.progress.mustDoCompleted}/${plan.progress.mustDoTotal} must-dos complete · ${formatMinutes(plan.progress.focusDone)} of ${formatMinutes(plan.progress.focusRequired)} focus verified.`
                  : isVi
                    ? "Chưa cấu hình việc Bắt buộc cho cổng hôm nay."
                    : "No Must-dos configured for today's gate yet."}
              </p>
            </div>
          </div>
          <Link href="/focus" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {isVi ? "Vào Tập trung" : "Go to focus"} <ArrowRight className="size-3" />
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
                {plan
                  ? isVi ? "Kế hoạch hôm nay đang chờ bắt đầu." : "Today's plan is waiting to start."
                  : isVi ? "Chưa có kế hoạch cho hôm nay." : "No plan for today yet."}
              </p>
              <p className="mt-0.5 text-[11px] text-muted">
                {plan
                  ? isVi
                    ? "Xác nhận và kích hoạt kế hoạch để bắt đầu kiếm thưởng hôm nay."
                    : "Confirm and activate the plan to begin earning today's reward."
                  : isVi
                    ? "Lên kế hoạch các việc Bắt buộc trước; ví được nạp từ công việc đã hoàn thành."
                    : "Plan the must-dos first; the wallet is funded by finished work."}
              </p>
            </div>
          </div>
          <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {isVi ? "Mở Kế hoạch" : "Open planner"} <ArrowRight className="size-3" />
          </Link>
        </div>
      )}

      <EarnedTimeCard
        earnedMinutesBalance={v2.earnedMinutesBalance}
        streakFreezeCount={v2.streakFreezeCount}
        unlockPassUntil={v2.unlockPassUntil}
      />

      <section className="mt-4 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={isVi ? "Khả dụng ngay" : "Available now"}
          value={formatMinutes(wallet.availableMinutes)}
          hint={
            isVi
              ? `${activeGrants.length} gói đang hiệu lực${expiringSoon.length > 0 ? ` · ${expiringSoon.length} sắp hết hạn` : ""}`
              : `${activeGrants.length} active grant${activeGrants.length === 1 ? "" : "s"}${
                  expiringSoon.length > 0 ? ` · ${expiringSoon.length} expiring soon` : ""
                }`
          }
          icon={WalletIcon}
          tone="accent"
        />
        <StatCard
          label={isVi ? "Tổng đã nhận" : "Earned all time"}
          value={formatMinutes(wallet.earnedMinutes)}
          hint={isVi ? "Từ các kế hoạch ngày đã hoàn thành" : "From completed daily plans"}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label={isVi ? "Tổng đã dùng" : "Spent all time"}
          value={formatMinutes(wallet.consumedMinutes)}
          hint={isVi ? "Thời gian giải trí đã ghi nhận" : "Logged entertainment time"}
          icon={TrendingDown}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{isVi ? "Gói thưởng đang hiệu lực" : "Active grants"}</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  {isVi
                    ? "Mỗi gói thưởng có thời hạn riêng. Hãy dùng trước khi hết hạn."
                    : "Each grant expires on its own clock. Use it before it disappears."}
                </p>
              </div>
              <Badge tone="success">
                {activeGrants.length} {isVi ? "đang mở" : "open"}
              </Badge>
            </CardHeader>
            <CardContent className="pt-4">
              {activeGrants.length === 0 ? (
                <EmptyState
                  icon={WalletIcon}
                  title={isVi ? "Không có gói thưởng nào" : "No active grants"}
                  description={
                    isVi
                      ? "Hoàn thành một kế hoạch ngày và nhận thưởng để mở khóa thời gian giải trí."
                      : "Complete a daily plan and claim its reward to open your next block of earned time."
                  }
                  action={
                    <Link href="/planner" className={buttonVariants({ variant: "outline", size: "sm" })}>
                      {isVi ? "Lập kế hoạch" : "Plan today"} <ArrowRight className="size-3" />
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
                              {isVi
                                ? (sourceLabelsVi[grant.source] ?? humanizeLocalized(grant.source))
                                : (sourceLabels[grant.source] ?? humanize(grant.source))}
                            </p>
                            <p className="mt-0.5 text-[10.5px] text-muted">
                              {isVi ? "Hết hạn " : "Expires "}
                              {formatDate(
                                grant.expiresAt,
                                { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                                timezone,
                                locale,
                              )}
                            </p>
                          </div>
                          <p className="font-display text-[24px] leading-none">
                            {formatMinutes(grant.remainingMinutes)}
                            <span className="ml-1 font-sans text-[10px] text-muted">
                              {isVi ? "còn lại" : "left"}
                            </span>
                          </p>
                        </div>
                        <Progress
                          value={100 - usedPercent}
                          tone={usedPercent > 70 ? "warning" : "accent"}
                          className="mt-3"
                        />
                        <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                          <span>
                            {formatMinutes(grant.consumedMinutes)} {isVi ? "đã dùng" : "spent"}
                          </span>
                          <span>
                            {formatMinutes(grant.grantedMinutes)} {isVi ? "được cấp" : "granted"}
                          </span>
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
                <CardTitle>{isVi ? "Sổ cái giao dịch" : "Ledger"}</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  {isVi
                    ? "Mọi thay đổi số dư của bạn theo thứ tự thời gian."
                    : "Every change to your balance, in order."}
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {wallet.ledger.length === 0 ? (
                <EmptyState
                  icon={History}
                  title={isVi ? "Chưa có giao dịch" : "No ledger entries"}
                  description={
                    isVi
                      ? "Các lần nhận hoặc dùng phút thưởng sẽ hiển thị tại đây."
                      : "Earning or spending minutes will show here with an audit trail."
                  }
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
                          <p className="text-[12px] font-medium">{humanizeLocalized(entry.reason)}</p>
                          <p className="mt-0.5 text-[10.5px] text-muted">
                            {formatDate(
                              entry.createdAt,
                              { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                              timezone,
                              locale,
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
                <CardTitle>{isVi ? "Dùng thời gian" : "Spend time"}</CardTitle>
                <p className="mt-1 text-[12px] text-muted">
                  {isVi
                    ? "Quy đổi số phút kiếm được thành giờ nghỉ ngơi."
                    : "Turn earned minutes into a real break."}
                </p>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <SpendForm grants={activeGrants} timezone={timezone} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isVi ? "Sử dụng gần đây" : "Recent usage"}</CardTitle>
              <Clock3 className="size-4 text-muted" strokeWidth={1.8} />
            </CardHeader>
            <CardContent className="pt-4">
              {wallet.usage.length === 0 ? (
                <EmptyState
                  icon={Clock3}
                  title={isVi ? "Chưa dùng phút nào" : "Nothing spent yet"}
                  description={
                    isVi
                      ? "Thời gian giải trí đã ghi nhận sẽ hiện ở đây."
                      : "Logged entertainment time will appear here."
                  }
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
                            locale,
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
                <p className="text-[12.5px] font-medium">
                  {isVi ? "Nguyên tắc của cổng" : "The rule of the gate"}
                </p>
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                {isVi
                  ? "Phút thưởng chỉ có được khi hoàn thành kế hoạch ngày với các phiên tập trung hợp lệ."
                  : "Minutes are only earned by completed plans with verified focus. Spending is logged against the grant — no hidden math, no infinite scroll."}
              </p>
              <p className="mt-3 text-[10.5px] text-muted">
                {isVi
                  ? `Múi giờ: ${timezone} · Phần thưởng hết hạn lúc 04:00 sáng.`
                  : `Time zone: ${timezone} · Grants expire at 04:00 local time.`}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <p className="mt-6 flex items-center gap-1.5 text-[10.5px] text-muted">
        <Timer className="size-3" />{" "}
        {isVi
          ? "Số dư được tính từ sổ cái phần thưởng trên máy chủ, không lưu cục bộ trên trình duyệt."
          : "Balance is computed from the reward ledger, not stored by the browser."}
      </p>
    </div>
  );
}
