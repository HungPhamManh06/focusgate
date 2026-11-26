"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type DueItem = {
  id: string;
  title: string;
  dueDate: string | null;
  kind: string;
};

export function DeadlineMiniCalendar({ items }: { items: DueItem[] }) {
  const isVi = useLocale() === "vi";
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedIso, setSelectedIso] = useState<string>(now.toISOString().slice(0, 10));

  const dueMap = useMemo(() => {
    const map = new Map<string, DueItem[]>();
    for (const item of items) {
      if (!item.dueDate) continue;
      const iso = item.dueDate.slice(0, 10);
      const list = map.get(iso) ?? [];
      list.push(item);
      map.set(iso, list);
    }
    return map;
  }, [items]);

  const firstOfMonth = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayIso = now.toISOString().slice(0, 10);

  const monthLabel = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    month: "long",
    year: "numeric",
  }).format(firstOfMonth);

  const cells: Array<{ day: number | null; iso: string | null }> = [];
  for (let i = 0; i < startOffset; i += 1) cells.push({ day: null, iso: null });
  for (let d = 1; d <= daysInMonth; d += 1) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso });
  }

  const selectedItems = dueMap.get(selectedIso) ?? [];

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <CalendarDays className="size-4 text-accent" />
          {isVi ? "Lịch Hạn Chót (Tháng)" : "Deadline Calendar"}
        </CardTitle>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted hover:text-ink"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          <span className="min-w-[110px] text-center text-[12px] font-medium capitalize text-ink">
            {monthLabel}
          </span>
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="flex size-7 items-center justify-center rounded-lg border border-line bg-surface-2 text-muted hover:text-ink"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted">
          {(isVi ? ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] : ["M", "T", "W", "T", "F", "S", "S"]).map(
            (d, i) => (
              <span key={d + i} className="py-1">
                {d}
              </span>
            ),
          )}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map((cell, idx) => {
            if (!cell.day || !cell.iso) return <div key={`empty-${idx}`} className="h-8" />;
            const dueList = dueMap.get(cell.iso) ?? [];
            const isToday = cell.iso === todayIso;
            const isSelected = cell.iso === selectedIso;
            return (
              <button
                key={cell.iso}
                type="button"
                onClick={() => setSelectedIso(cell.iso!)}
                className={cn(
                  "relative flex h-8 flex-col items-center justify-center rounded-lg text-[11.5px] transition-colors",
                  isSelected
                    ? "bg-ink font-semibold text-canvas"
                    : isToday
                      ? "border border-accent/50 bg-accent-soft text-accent font-semibold"
                      : "hover:bg-surface-2 text-ink-soft",
                )}
              >
                <span>{cell.day}</span>
                {dueList.length > 0 ? (
                  <span
                    className={cn(
                      "absolute bottom-1 size-1.5 rounded-full",
                      isSelected ? "bg-canvas" : "bg-accent",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-3 border-t border-line pt-2.5 text-[12px]">
          <p className="text-[11px] font-semibold text-muted">
            {isVi ? `Hạn chót ngày ${selectedIso}:` : `Due on ${selectedIso}:`}
          </p>
          {selectedItems.length === 0 ? (
            <p className="mt-1 text-[11.5px] text-muted/80">
              {isVi ? "Không có nhiệm vụ nào đến hạn ngày này." : "No tasks due on this day."}
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {selectedItems.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-ink">
                  <span className="size-1.5 rounded-full bg-accent" />
                  <span className="truncate">{item.title}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
