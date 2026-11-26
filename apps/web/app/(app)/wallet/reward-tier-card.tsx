"use client";

import { Award } from "lucide-react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

const TIERS = [
  { min: 0, en: "Initiate", vi: "Người Khởi hành", next: 120 },
  { min: 120, en: "Steady Keeper", vi: "Người Giữ nhịp", next: 360 },
  { min: 360, en: "Time Architect", vi: "Kiến trúc sư Thời gian", next: 900 },
  { min: 900, en: "Master of Depth", vi: "Bậc thầy Chiều sâu", next: 1800 },
] as const;

export function RewardTierCard({ earnedMinutes }: { earnedMinutes: number }) {
  const isVi = useLocale() === "vi";
  let current: (typeof TIERS)[number] = TIERS[0];
  for (const tier of TIERS) {
    if (earnedMinutes >= tier.min) current = tier;
  }
  const span = Math.max(1, current.next - current.min);
  const pct = Math.min(100, Math.round(((earnedMinutes - current.min) / span) * 100));
  const remaining = Math.max(0, current.next - earnedMinutes);

  return (
    <Card className="mt-4 fg-bento-glow">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Award className="size-4 text-accent" />
          <CardTitle>{isVi ? "Cấp bậc Kỷ luật Tích lũy" : "Discipline Tier Rank"}</CardTitle>
        </div>
        <span className="rounded-full border border-accent/30 bg-accent-soft px-3 py-0.5 text-[11.5px] font-semibold text-accent">
          {isVi ? current.vi : current.en}
        </span>
      </CardHeader>
      <CardContent className="space-y-2 pt-2">
        <div className="flex items-center justify-between text-[11.5px] text-muted tabular-nums">
          <span>
            {isVi ? `Đã tích lũy: ${formatMinutes(earnedMinutes)}` : `Total earned: ${formatMinutes(earnedMinutes)}`}
          </span>
          <span>
            {remaining > 0
              ? isVi
                ? `Còn ${formatMinutes(remaining)} để lên cấp`
                : `${formatMinutes(remaining)} to next tier`
              : isVi
                ? "Đã đạt đỉnh cao!"
                : "Top tier unlocked!"}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
      </CardContent>
    </Card>
  );
}
