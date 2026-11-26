import { Award, Crown, Flame, Timer, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

export function HallOfFameCard({
  bestDayMinutes,
  bestDayLabel,
  bestStreak,
  totalFocusMinutes,
  goldSeals,
  locale = "en",
}: {
  bestDayMinutes: number;
  bestDayLabel: string | null;
  bestStreak: number;
  totalFocusMinutes: number;
  goldSeals: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const records = [
    {
      icon: Crown,
      label: isVi ? "Ngày tập trung đỉnh cao" : "Peak Focus Day",
      value: bestDayMinutes > 0 ? formatMinutes(bestDayMinutes) : "—",
      hint: bestDayLabel ?? (isVi ? "Chưa có dữ liệu" : "No record yet"),
      tone: "text-amber-500 bg-amber-500/12",
    },
    {
      icon: Flame,
      label: isVi ? "Chuỗi kỷ luật dài nhất" : "Longest Streak",
      value: isVi ? `${bestStreak} ngày` : `${bestStreak}d`,
      hint: isVi ? "Kỷ lục cá nhân" : "Personal record",
      tone: "text-accent bg-accent-soft",
    },
    {
      icon: Timer,
      label: isVi ? "Tổng thời gian trong kỳ" : "Period Deep Work",
      value: formatMinutes(totalFocusMinutes),
      hint: isVi ? "Đã xác thực máy chủ" : "Server-verified",
      tone: "text-indigo-500 bg-indigo-500/12",
    },
    {
      icon: Award,
      label: isVi ? "Con dấu Vàng đạt được" : "Gold Wax Seals",
      value: String(goldSeals),
      hint: isVi ? "Hoàn hảo kỷ luật + sức khỏe" : "Focus + Health mastery",
      tone: "text-success bg-success-soft",
    },
  ];

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="size-4 text-amber-500" />
          {isVi ? "Bảng Kỷ Lục Cá Nhân (Hall of Fame)" : "Personal Records · Hall of Fame"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {records.map((rec) => {
          const Icon = rec.icon;
          return (
            <div
              key={rec.label}
              className="rounded-2xl border border-line bg-surface-2/55 p-4"
            >
              <span
                className={`inline-flex size-8 items-center justify-center rounded-xl ${rec.tone}`}
              >
                <Icon className="size-4" />
              </span>
              <p className="mt-3 text-[11px] font-medium text-muted">{rec.label}</p>
              <p className="mt-1 font-display text-[26px] leading-none tabular-nums text-ink">
                {rec.value}
              </p>
              <p className="mt-1.5 text-[11px] text-muted">{rec.hint}</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
