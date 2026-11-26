import { PieChart, Shield } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import type { LedgerEntry } from "@/lib/data/types";

const BAR_COLORS = ["bg-accent", "bg-indigo-500", "bg-amber-500", "bg-teal-500"];

export function WalletInsightsStrip({
  streakFreezeCount,
  ledger,
  locale = "en",
}: {
  streakFreezeCount: number;
  ledger: LedgerEntry[];
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const spendMap = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.deltaMinutes >= 0) continue;
    const key = (entry.note || (isVi ? "Giải trí khác" : "Other leisure")).trim();
    spendMap.set(key, (spendMap.get(key) ?? 0) + Math.abs(entry.deltaMinutes));
  }
  const breakdown = [...spendMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const totalSpent = breakdown.reduce((s, [, m]) => s + m, 0);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Shield className="size-4 text-sky-500" />
            {isVi ? "Khiên Bảo Vệ Chuỗi (Streak Shield)" : "Streak Freeze Shield"}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4 pt-2">
          <div>
            <p className="font-display text-[28px] leading-none tabular-nums text-ink">
              {streakFreezeCount}
            </p>
            <p className="mt-1.5 text-[12px] text-muted">
              {isVi
                ? "Tự động bảo vệ chuỗi ngày kỷ luật nếu có 1 ngày bạn bận đột xuất."
                : "Automatically shields your discipline streak if an unexpected day hits."}
            </p>
          </div>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-500">
            <Shield className="size-6" />
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <PieChart className="size-4 text-accent" />
            {isVi ? "Phân bổ Chi tiêu Giải trí" : "Entertainment Spending Breakdown"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          {breakdown.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi ? "Chưa có lượt đổi phút giải trí nào." : "No leisure spending logged yet."}
            </p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-2">
                {breakdown.map(([label, mins], idx) => (
                  <div
                    key={label}
                    title={`${label}: ${formatMinutes(mins)}`}
                    className={BAR_COLORS[idx % BAR_COLORS.length]}
                    style={{ width: `${Math.max(4, (mins / Math.max(1, totalSpent)) * 100)}%` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
                {breakdown.map(([label, mins], idx) => (
                  <span key={label} className="inline-flex items-center gap-1.5 text-ink-soft">
                    <span className={`size-2 rounded-full ${BAR_COLORS[idx % BAR_COLORS.length]}`} />
                    <span className="max-w-[110px] truncate">{label}</span>
                    <span className="font-semibold tabular-nums text-muted">{formatMinutes(mins)}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
