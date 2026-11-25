"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Clock3, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import type { FocusSession } from "@/lib/data/types";
import type { PlanScheduleItem } from "@/lib/data/v3-features";
import type { CalendarBusyEvent } from "@/lib/domain/ics-parser";
import { cn } from "@/lib/utils";

const START_HOUR = 8;
const END_HOUR = 22;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

function toPercent(hhmm: string): number {
  const [h = 8, m = 0] = hhmm.split(":").map((x) => Number.parseInt(x, 10) || 0);
  const offset = (h - START_HOUR) * 60 + m;
  return Math.max(0, Math.min(100, (offset / TOTAL_MINUTES) * 100));
}

export function DayTimelineRibbon({
  schedules,
  busyEvents,
  activeSession,
  locale = "en",
}: {
  schedules: PlanScheduleItem[];
  busyEvents: CalendarBusyEvent[];
  activeSession: FocusSession | null;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [nowPct, setNowPct] = useState<number>(() => {
    const d = new Date();
    const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes();
    return Math.max(0, Math.min(100, (mins / TOTAL_MINUTES) * 100));
  });
  const [nowLabel, setNowLabel] = useState<string>(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const mins = (d.getHours() - START_HOUR) * 60 + d.getMinutes();
      setNowPct(Math.max(0, Math.min(100, (mins / TOTAL_MINUTES) * 100)));
      setNowLabel(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    };
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const scheduledItems = schedules.filter((s) => Boolean(s.scheduledStart));

  return (
    <div className="space-y-3">
      {/* Live Active Focus Banner (synced across Web & Android) */}
      {activeSession && (
        <Link
          href="/focus"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/35 bg-gradient-to-r from-accent-soft/80 via-surface to-surface px-4 py-3 transition-all hover:border-accent"
        >
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-accent text-white">
              <Timer className="size-4 animate-pulse" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                {activeSession.status === "paused"
                  ? isVi
                    ? "Phiên tập trung đang tạm dừng"
                    : "Focus session paused"
                  : isVi
                    ? "Đang trong phiên tập trung live"
                    : "Live focus session running"}
              </p>
              <p className="text-[13.5px] font-semibold text-ink">
                {activeSession.taskTitle ?? (isVi ? "Tập trung sâu" : "Deep Focus Sprint")} ·{" "}
                {activeSession.plannedMinutes}m
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-[12px] font-semibold text-white">
            {isVi ? "Vào Focus Studio" : "Open Focus Studio"} <ArrowRight className="size-3.5" />
          </span>
        </Link>
      )}

      {/* Horizontal 08:00 -> 22:00 Day Rhythm Strip */}
      <div className="rounded-2xl border border-line bg-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
          <span className="flex items-center gap-1.5 font-semibold text-ink">
            <Clock3 className="size-3.5 text-accent" />
            {isVi ? "Nhịp độ hôm nay (08:00 → 22:00)" : "Today's Rhythm (08:00 → 22:00)"}
          </span>
          <div className="flex items-center gap-3 text-muted">
            <span>
              {isVi ? `Bây giờ: ${nowLabel}` : `Now: ${nowLabel}`} ·{" "}
              {Math.round(nowPct)}%
            </span>
            <Link
              href="/planner"
              className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
            >
              <CalendarClock className="size-3" />
              {isVi ? "Kéo thả giờ" : "Time-block"}
            </Link>
          </div>
        </div>

        <div className="relative mt-2.5 h-3 w-full overflow-hidden rounded-full bg-surface-2">
          {/* Elapsed day fill */}
          <div
            className="h-full rounded-full bg-line/70 transition-all"
            style={{ width: `${nowPct}%` }}
          />

          {/* Busy ICS Calendar events */}
          {busyEvents.map((evt) => {
            const left = toPercent(evt.startHhMm);
            const right = toPercent(evt.endHhMm);
            return (
              <div
                key={evt.uid}
                title={`📅 ${evt.summary} (${evt.startHhMm}–${evt.endHhMm})`}
                className="absolute top-0 h-full rounded-sm bg-ink/25"
                style={{ left: `${left}%`, width: `${Math.max(2, right - left)}%` }}
              />
            );
          })}

          {/* Scheduled FocusGate Time-Blocks */}
          {scheduledItems.map((item) => {
            const left = toPercent(item.scheduledStart!);
            const right = item.scheduledEnd ? toPercent(item.scheduledEnd) : Math.min(100, left + 7);
            return (
              <div
                key={item.planTaskId}
                title={`${item.title} (${item.scheduledStart}–${item.scheduledEnd ?? ""})`}
                className={cn(
                  "absolute top-0 h-full rounded-sm",
                  item.completed ? "bg-success" : "bg-accent",
                )}
                style={{ left: `${left}%`, width: `${Math.max(2.5, right - left)}%` }}
              />
            );
          })}

          {/* Live Now Marker */}
          <div
            className="absolute top-0 h-full w-0.5 bg-danger shadow-[0_0_6px_rgba(185,28,28,0.8)]"
            style={{ left: `${nowPct}%` }}
          />
        </div>

        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted">
          <span>08:00</span>
          <span>12:00</span>
          <span>16:00</span>
          <span>20:00</span>
          <span>22:00</span>
        </div>
      </div>
    </div>
  );
}
