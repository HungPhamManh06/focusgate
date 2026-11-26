"use client";

import { CalendarDays, CheckCircle2, Timer, TrendingDown } from "lucide-react";
import { useState } from "react";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

type DayEntry = {
  date: string;
  label: string;
  focusMinutes: number;
  tasksCompleted: number;
  entertainmentMinutes: number;
};

export function WeeklyPeekStrip({
  days,
  locale = "en",
}: {
  days: DayEntry[];
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const last7 = days.slice(-7);
  const [selectedIdx, setSelectedIdx] = useState<number>(Math.max(0, last7.length - 1));

  if (last7.length === 0) return null;
  const active = last7[selectedIdx] ?? last7[last7.length - 1]!;
  const maxFocus = Math.max(30, ...last7.map((d) => d.focusMinutes));

  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-ink">
          <CalendarDays className="size-3.5 text-accent" />
          {isVi ? "Xem nhanh 7 ngày gần nhất" : "7-Day Quick Peek"}
        </span>

        <div className="flex items-center gap-1.5">
          {last7.map((day, idx) => {
            const isSelected = idx === selectedIdx;
            const barH = Math.max(4, Math.round((day.focusMinutes / maxFocus) * 18));
            const shortDay = day.label.split(" ")[0] ?? day.date.slice(8);
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelectedIdx(idx)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border px-2 py-1 text-[10px] transition-all",
                  isSelected
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-transparent bg-surface-2/60 text-muted hover:border-line hover:text-ink",
                )}
              >
                <span className="flex h-5 items-end">
                  <span
                    className={cn(
                      "w-2 rounded-full transition-all",
                      day.focusMinutes > 0
                        ? isSelected
                          ? "bg-accent"
                          : "bg-accent/50"
                        : "bg-line",
                    )}
                    style={{ height: `${barH}px` }}
                  />
                </span>
                <span className="font-medium leading-none">{shortDay}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line/60 pt-2 text-[11.5px] text-muted">
        <span className="font-semibold text-ink">{active.label}</span>
        <span className="inline-flex items-center gap-1">
          <Timer className="size-3 text-accent" />
          {formatMinutes(active.focusMinutes)} {isVi ? "tập trung" : "focus"}
        </span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="size-3 text-success" />
          {active.tasksCompleted} {isVi ? "việc xong" : "tasks"}
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingDown className="size-3 text-warning" />
          {formatMinutes(active.entertainmentMinutes)} {isVi ? "giải trí" : "leisure"}
        </span>
      </div>
    </div>
  );
}
