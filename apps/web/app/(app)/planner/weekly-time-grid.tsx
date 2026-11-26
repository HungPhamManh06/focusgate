"use client";

import { CalendarDays, Clock3, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

interface ScheduleItem {
  planTaskId: string;
  title: string;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
}

interface BacklogItem {
  id: string;
  title: string;
  dueDate: string | null;
  estimatedMinutes: number;
  kind: string;
}

const WEEKDAYS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function getWeekDates(anchorIso: string): string[] {
  const base = new Date(`${anchorIso}T12:00:00Z`);
  const dow = base.getUTCDay(); // 0=Sun..6=Sat
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base.getTime() + mondayOffset * 86_400_000);
  return Array.from({ length: 7 }, (_, i) =>
    new Date(monday.getTime() + i * 86_400_000).toISOString().slice(0, 10),
  );
}

export function WeeklyTimeGrid({
  todayIso,
  schedules,
  backlog,
  todayFocusDone,
}: {
  todayIso: string;
  schedules: ScheduleItem[];
  backlog: BacklogItem[];
  todayFocusDone: number;
}) {
  const isVi = useLocale() === "vi";
  const weekDates = useMemo(() => getWeekDates(todayIso), [todayIso]);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  const columns = useMemo(() => {
    return weekDates.map((iso, index) => {
      const isToday = iso === todayIso;
      const dueTasks = backlog.filter((t) => t.dueDate && t.dueDate.slice(0, 10) === iso);
      const blocks = isToday
        ? schedules.map((s) => ({
            id: s.planTaskId,
            title: s.title || (isVi ? "Khối tập trung" : "Focus block"),
            minutes: 30,
            time: s.scheduledStart ? s.scheduledStart.slice(11, 16) : null,
          }))
        : dueTasks.map((t) => ({
            id: t.id,
            title: t.title,
            minutes: t.estimatedMinutes || 25,
            time: null,
          }));
      const totalMinutes = blocks.reduce((acc, b) => acc + b.minutes, 0);
      return {
        iso,
        dayNum: iso.slice(8, 10),
        label: isVi ? WEEKDAYS_VI[index] : WEEKDAYS_EN[index],
        isToday,
        blocks,
        totalMinutes,
      };
    });
  }, [weekDates, todayIso, backlog, schedules, isVi]);

  const activeCol = columns.find((c) => c.iso === selectedDate) ?? columns[0];

  return (
    <Card className="mt-4 overflow-hidden fg-bento-glow">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-accent" />
          <div>
            <CardTitle>{isVi ? "Lưới thời gian 7 ngày (Tuần này)" : "Weekly 7-Day Time Grid"}</CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {isVi
                ? "Tổng quan khối giờ tập trung và hạn chót trong tuần. Bấm vào từng ngày để xem chi tiết."
                : "Overview of scheduled focus blocks and deadlines across the week. Click any day to inspect."}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft tabular-nums">
          <Sparkles className="size-3 text-accent" />
          {isVi ? `Hôm nay: ${formatMinutes(todayFocusDone)}` : `Today: ${formatMinutes(todayFocusDone)}`}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {columns.map((col) => {
            const selected = col.iso === selectedDate;
            const loadPct = Math.min(100, Math.round((col.totalMinutes / 180) * 100));
            return (
              <button
                key={col.iso}
                type="button"
                onClick={() => setSelectedDate(col.iso)}
                className={cn(
                  "flex flex-col items-start rounded-xl border p-2 text-left transition-all sm:p-2.5",
                  selected
                    ? "border-accent bg-accent-soft/60 shadow-xs"
                    : col.isToday
                      ? "border-accent/35 bg-surface-2/70"
                      : "border-line bg-surface hover:border-line-strong hover:bg-surface-2/50",
                )}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className={cn("text-[10.5px] font-semibold uppercase", col.isToday ? "text-accent" : "text-muted")}>
                    {col.label}
                  </span>
                  <span className="text-[11px] font-semibold tabular-nums text-ink">{col.dayNum}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      col.isToday ? "bg-accent" : "bg-ink/60",
                    )}
                    style={{ width: `${Math.max(col.blocks.length > 0 ? 16 : 0, loadPct)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[10px] font-medium text-muted tabular-nums">
                  {col.blocks.length > 0
                    ? `${col.blocks.length} · ${formatMinutes(col.totalMinutes)}`
                    : isVi
                      ? "Trống"
                      : "Free"}
                </p>
              </button>
            );
          })}
        </div>

        {activeCol ? (
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold text-ink">
                {activeCol.label} · {activeCol.iso}
                {activeCol.isToday ? (isVi ? " (Hôm nay)" : " (Today)") : ""}
              </p>
              <span className="inline-flex items-center gap-1 text-[11px] text-muted tabular-nums">
                <Clock3 className="size-3" />
                {formatMinutes(activeCol.totalMinutes)}
              </span>
            </div>
            {activeCol.blocks.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-muted">
                {isVi
                  ? "Chưa có khối giờ hoặc hạn chót nào cho ngày này."
                  : "No focus blocks or due tasks scheduled for this day."}
              </p>
            ) : (
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {activeCol.blocks.slice(0, 6).map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11.5px]"
                  >
                    <span className="truncate font-medium text-ink">{b.title}</span>
                    <span className="shrink-0 font-mono text-[10.5px] text-muted tabular-nums">
                      {b.time ? `${b.time} · ` : ""}
                      {formatMinutes(b.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
