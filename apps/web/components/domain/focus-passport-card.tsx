import { Award, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import {
  buildDailySeals,
  type DailySeal,
  type SealTier,
} from "@/lib/domain/focus-passport";
import { cn } from "@/lib/utils";

function WaxSealStamp({
  seal,
  isVi,
}: {
  seal: DailySeal;
  isVi: boolean;
}) {
  const styles: Record<SealTier, { ring: string; fill: string; arch: string; text: string }> = {
    gold: {
      ring: "border-amber-500/70 bg-gradient-to-br from-amber-300/35 via-amber-500/20 to-amber-700/25 shadow-[0_4px_14px_-6px_rgba(217,119,6,0.65)]",
      fill: "#d97706",
      arch: "#fef3c7",
      text: "text-amber-700 dark:text-amber-300",
    },
    crimson: {
      ring: "border-accent/60 bg-gradient-to-br from-accent/25 via-accent/15 to-accent-strong/25 shadow-[0_4px_12px_-6px_rgba(185,28,28,0.5)]",
      fill: "#b91c1c",
      arch: "#faf7f5",
      text: "text-accent",
    },
    ember: {
      ring: "border-warning/45 bg-warning-soft/70",
      fill: "#b45309",
      arch: "#fef3c7",
      text: "text-warning",
    },
    empty: {
      ring: "border-dashed border-line bg-surface-2/50 opacity-70",
      fill: "transparent",
      arch: "var(--muted)",
      text: "text-muted",
    },
  };

  const s = styles[seal.tier];
  const shortDay = seal.date.slice(8, 10);
  const titleParts = [
    seal.date,
    `${formatMinutes(seal.focusMinutes)} ${isVi ? "tập trung" : "focus"}`,
  ];
  if (seal.sleepMinutes !== null && seal.sleepMinutes > 0) {
    titleParts.push(
      `${(seal.sleepMinutes / 60).toFixed(1)}h ${isVi ? "ngủ" : "sleep"}`,
    );
  }

  return (
    <div
      title={titleParts.join(" · ")}
      className="flex flex-col items-center gap-1"
    >
      <div
        className={cn(
          "flex size-11 items-center justify-center rounded-full border-2 transition-transform hover:scale-105",
          s.ring,
        )}
      >
        <svg viewBox="0 0 32 32" className="size-6" fill="none" aria-hidden>
          {seal.tier !== "empty" ? (
            <circle cx="16" cy="16" r="14" fill={s.fill} opacity="0.92" />
          ) : null}
          <path
            d="M10.5 22.5V15a5.5 5.5 0 0 1 11 0v7.5"
            stroke={s.arch}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={seal.tier === "empty" ? 0.45 : 1}
          />
          <path
            d="M9.5 22.5h13"
            stroke={s.arch}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={seal.tier === "empty" ? 0.45 : 1}
          />
          {seal.tier === "gold" ? (
            <circle cx="16" cy="12" r="1.8" fill="#fde68a" />
          ) : seal.tier === "crimson" ? (
            <circle cx="16" cy="12" r="1.5" fill="#fca5a5" />
          ) : null}
        </svg>
      </div>
      <span className={cn("text-[10px] font-medium tabular-nums", s.text)}>
        {shortDay}
      </span>
    </div>
  );
}

export function FocusPassportCard({
  statsDays,
  healthDays,
  locale = "en",
}: {
  statsDays: ReadonlyArray<{
    date: string;
    label: string;
    focusMinutes: number;
    tasksCompleted?: number;
  }>;
  healthDays: ReadonlyArray<{
    date: string;
    sleepMinutes: number;
  }>;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const passport = buildDailySeals(statsDays, healthDays);
  const visibleSeals = passport.seals.slice(-30);

  return (
    <Card className="mt-4 overflow-hidden">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Award className="size-4 text-accent" />
            <CardTitle>{isVi ? "Hộ chiếu kỷ luật" : "Discipline Passport"}</CardTitle>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Mỗi ngày tập trung hợp lệ sẽ đóng một con dấu sáp vào cuốn sổ của bạn. Dấu Vàng dành cho ngày tập trung sâu kèm giấc ngủ tốt."
              : "Every verified focus day stamps a wax seal into your ledger. Gold seals reward deep focus paired with solid rest."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-medium">
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-1 text-amber-700 dark:text-amber-300 tabular-nums">
            <Award className="size-3.5" />
            {isVi ? `${passport.goldCount} dấu Vàng` : `${passport.goldCount} Gold`}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-accent tabular-nums">
            <Flame className="size-3.5" />
            {isVi ? `Chuỗi ${passport.currentStreak} ngày` : `${passport.currentStreak}d streak`}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-7 gap-2.5 sm:grid-cols-10 md:grid-cols-15">
          {visibleSeals.map((seal) => (
            <WaxSealStamp key={seal.date} seal={seal} isVi={isVi} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-line pt-3 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-amber-500" />
            {isVi ? "Dấu Vàng (Tập trung sâu ≥90p + Ngủ ≥7h)" : "Gold (≥90m focus + ≥7h sleep)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-accent" />
            {isVi ? "Dấu Đỏ (≥25p tập trung / xong việc)" : "Crimson (≥25m focus / task done)"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-warning" />
            {isVi ? "Khởi động (<25p)" : "Warm-up (<25m)"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
