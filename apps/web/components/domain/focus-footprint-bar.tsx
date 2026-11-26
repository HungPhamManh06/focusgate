"use client";

import { Clock3 } from "lucide-react";
import { useLocale } from "@/components/i18n/language-provider";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

interface SessionSlice {
  id: string;
  startedAt: string;
  creditedMinutes: number;
  isValid: boolean;
  taskTitle: string | null;
}

const START_HOUR = 6;
const END_HOUR = 24;
const SPAN_MINUTES = (END_HOUR - START_HOUR) * 60;

export function FocusFootprintBar({
  sessions,
  totalMinutes,
}: {
  sessions: SessionSlice[];
  totalMinutes: number;
}) {
  const isVi = useLocale() === "vi";

  const blocks = sessions
    .filter((s) => s.creditedMinutes > 0)
    .map((s) => {
      const dt = new Date(s.startedAt);
      const startMin = dt.getHours() * 60 + dt.getMinutes() - START_HOUR * 60;
      const clampedStart = Math.max(0, Math.min(SPAN_MINUTES - 15, startMin));
      const leftPct = (clampedStart / SPAN_MINUTES) * 100;
      const widthPct = Math.max(1.8, Math.min(100 - leftPct, (s.creditedMinutes / SPAN_MINUTES) * 100));
      return {
        ...s,
        leftPct,
        widthPct,
      };
    });

  return (
    <div
      data-bento-id="footprint"
      data-hide-compact="true"
      className="mt-4 rounded-2xl border border-line bg-surface px-4 py-3 fg-bento-glow"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
        <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
          <Clock3 className="size-3.5 text-accent" />
          {isVi ? "Dấu ấn Tập trung Hôm nay (06:00 → 24:00)" : "Today's Focus Footprint (06:00 → 24:00)"}
        </span>
        <span className="font-mono text-[11px] text-muted tabular-nums">
          {blocks.length > 0
            ? isVi
              ? `${blocks.length} khối · ${formatMinutes(totalMinutes)}`
              : `${blocks.length} blocks · ${formatMinutes(totalMinutes)}`
            : isVi
              ? "Chưa có dấu ấn hôm nay"
              : "No focus blocks yet"}
        </span>
      </div>

      <div className="relative mt-2.5 h-3 w-full overflow-hidden rounded-full bg-surface-2">
        {blocks.map((b) => (
          <div
            key={b.id}
            title={`${b.taskTitle || (isVi ? "Tập trung" : "Focus")} · ${formatMinutes(b.creditedMinutes)}`}
            className={cn(
              "absolute top-0 bottom-0 rounded-full transition-opacity hover:opacity-100",
              b.isValid ? "bg-accent opacity-90" : "bg-warning/70 opacity-75",
            )}
            style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
          />
        ))}
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted tabular-nums">
        <span>06:00</span>
        <span>12:00</span>
        <span>18:00</span>
        <span>24:00</span>
      </div>
    </div>
  );
}
