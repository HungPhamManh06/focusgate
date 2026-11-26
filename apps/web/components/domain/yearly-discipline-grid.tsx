"use client";

import { CalendarRange } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

type DayEntry = {
  date: string;
  label: string;
  focusMinutes: number;
  tasksCompleted: number;
};

type GridCell = {
  date: string;
  focusMinutes: number;
  tasksCompleted: number;
  level: 0 | 1 | 2 | 3 | 4;
};

export function YearlyDisciplineGrid({
  days,
  locale = "en",
}: {
  days: DayEntry[];
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [hovered, setHovered] = useState<GridCell | null>(null);

  const { weeks, totalActiveDays } = useMemo(() => {
    const byDate = new Map<string, DayEntry>();
    for (const d of days) byDate.set(d.date, d);

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    // Align to 52 full weeks (364 days ending today)
    const totalDays = 364;
    const cells: GridCell[] = [];
    let activeCount = 0;

    for (let i = totalDays - 1; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const match = byDate.get(iso);
      const focusMinutes = match?.focusMinutes ?? 0;
      const tasksCompleted = match?.tasksCompleted ?? 0;
      const score = focusMinutes + tasksCompleted * 15;
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (score >= 90) level = 4;
      else if (score >= 50) level = 3;
      else if (score >= 25) level = 2;
      else if (score > 0) level = 1;
      if (score > 0) activeCount += 1;
      cells.push({ date: iso, focusMinutes, tasksCompleted, level });
    }

    const grouped: GridCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      grouped.push(cells.slice(i, i + 7));
    }
    return { weeks: grouped, totalActiveDays: activeCount };
  }, [days]);

  const levelClass: Record<0 | 1 | 2 | 3 | 4, string> = {
    0: "bg-surface-2 border-line/60",
    1: "bg-accent/25 border-accent/30",
    2: "bg-accent/50 border-accent/55",
    3: "bg-accent/75 border-accent/80",
    4: "bg-accent border-accent",
  };

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <CalendarRange className="size-4 text-accent" />
            <CardTitle>
              {isVi ? "Lưới Kỷ Luật 365 Ngày" : "365-Day Discipline Grid"}
            </CardTitle>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? `${totalActiveDays} ngày có hoạt động trong dữ liệu đã tải. Chọn kỳ 365 ngày ở trên để xem trọn vẹn cả năm.`
              : `${totalActiveDays} active days in loaded range. Select 365 days above for the full year.`}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <span>{isVi ? "Ít" : "Less"}</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              aria-hidden
              className={cn("size-3 rounded-[3px] border", levelClass[lvl])}
            />
          ))}
          <span>{isVi ? "Nhiều" : "More"}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1">
                {week.map((cell) => (
                  <button
                    key={cell.date}
                    type="button"
                    onMouseEnter={() => setHovered(cell)}
                    onFocus={() => setHovered(cell)}
                    title={`${cell.date}: ${formatMinutes(cell.focusMinutes)} · ${cell.tasksCompleted} tasks`}
                    aria-label={`${cell.date}: ${formatMinutes(cell.focusMinutes)}, ${cell.tasksCompleted} tasks`}
                    className={cn(
                      "size-3 rounded-[3px] border transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-none",
                      levelClass[cell.level],
                    )}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex min-h-5 items-center justify-between text-[11.5px] text-muted">
          {hovered ? (
            <span>
              <strong className="font-medium text-ink">{hovered.date}</strong> ·{" "}
              {formatMinutes(hovered.focusMinutes)} {isVi ? "tập trung" : "focus"} ·{" "}
              {hovered.tasksCompleted} {isVi ? "nhiệm vụ" : "tasks"}
            </span>
          ) : (
            <span>
              {isVi
                ? "Di chuột vào từng ô để xem chi tiết ngày đó."
                : "Hover any tile to inspect that day's discipline."}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
