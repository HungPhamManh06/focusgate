"use client";

import { useLocale } from "@/components/i18n/language-provider";
import { formatMinutes } from "@/lib/data/format";

export function CapacityForecastRing({
  focusDone,
  pendingMinutes,
  dayBudget = 480,
}: {
  focusDone: number;
  pendingMinutes: number;
  dayBudget?: number;
}) {
  const isVi = useLocale() === "vi";
  const total = Math.max(dayBudget, focusDone + pendingMinutes, 60);
  const donePct = Math.min(100, (focusDone / total) * 100);
  const pendingPct = Math.min(100 - donePct, (pendingMinutes / total) * 100);
  const freeMinutes = Math.max(0, dayBudget - focusDone - pendingMinutes);

  const r = 24;
  const circ = 2 * Math.PI * r;
  const doneLen = (donePct / 100) * circ;
  const pendingLen = (pendingPct / 100) * circ;

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3 fg-bento-glow">
      <div className="flex items-center gap-3.5">
        <svg width="60" height="60" viewBox="0 0 60 60" className="shrink-0" aria-label="Capacity forecast">
          <circle cx="30" cy="30" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="7" />
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke="var(--success)"
            strokeWidth="7"
            strokeDasharray={`${doneLen} ${circ}`}
            transform="rotate(-90 30 30)"
          />
          <circle
            cx="30"
            cy="30"
            r={r}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="7"
            strokeDasharray={`${pendingLen} ${circ}`}
            strokeDashoffset={-doneLen}
            transform="rotate(-90 30 30)"
          />
        </svg>
        <div>
          <p className="text-[12.5px] font-semibold text-ink">
            {isVi ? "Dự báo Quỹ giờ Hôm nay" : "Daily Focus Capacity Forecast"}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {isVi
              ? "Cân đối giữa giờ đã tập trung, việc còn lại và quỹ giờ trống."
              : "Balance between completed focus, remaining tasks, and open headroom."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-[11.5px] tabular-nums">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-success" />
          <span className="text-muted">{isVi ? "Đã xong:" : "Done:"}</span>
          <strong className="text-ink">{formatMinutes(focusDone)}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-accent" />
          <span className="text-muted">{isVi ? "Còn lại:" : "Queued:"}</span>
          <strong className="text-ink">{formatMinutes(pendingMinutes)}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-line-strong" />
          <span className="text-muted">{isVi ? "Còn trống:" : "Free:"}</span>
          <strong className="text-ink">{formatMinutes(freeMinutes)}</strong>
        </span>
      </div>
    </div>
  );
}
