"use client";

import { Repeat } from "lucide-react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

const DAYS_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const DAYS_EN = ["M", "T", "W", "T", "F", "S", "S"];

export function HabitStreakStrip({ completedToday }: { completedToday: boolean }) {
  const isVi = useLocale() === "vi";
  // 0 = Monday ... 6 = Sunday
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1;
  const labels = isVi ? DAYS_VI : DAYS_EN;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/80 px-2 py-0.5 text-[10px] text-muted"
      title={isVi ? "Thói quen lặp lại hằng ngày" : "Daily repeating habit"}
    >
      <Repeat className="size-2.5 text-accent" />
      <span className="font-medium text-ink-soft">{isVi ? "Hằng ngày" : "Daily"}</span>
      <span className="flex items-center gap-0.5" aria-hidden>
        {labels.map((day, idx) => {
          const isToday = idx === todayIdx;
          const isPast = idx < todayIdx;
          return (
            <span
              key={day + idx}
              title={day}
              className={cn(
                "size-2 rounded-full border transition-colors",
                isToday
                  ? completedToday
                    ? "border-success bg-success"
                    : "border-accent bg-accent/25"
                  : isPast
                    ? "border-accent/40 bg-accent/40"
                    : "border-line bg-surface",
              )}
            />
          );
        })}
      </span>
    </span>
  );
}
