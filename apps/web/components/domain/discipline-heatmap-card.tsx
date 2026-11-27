import { Flame } from "lucide-react";
import { formatMinutes } from "@/lib/data/format";
import type { DayPoint } from "@/lib/data/types";
import { cn } from "@/lib/utils";

function intensityClass(minutes: number): string {
  if (minutes <= 0) return "bg-surface-2 border-line/70";
  if (minutes < 25) return "bg-accent/20 border-accent/25";
  if (minutes < 60) return "bg-accent/45 border-accent/40";
  if (minutes < 120) return "bg-accent/75 border-accent/60";
  return "bg-accent border-accent shadow-[0_0_8px_color-mix(in_srgb,var(--accent)_40%,transparent)]";
}

export function DisciplineHeatmapCard({
  days,
  isVi,
}: {
  days: DayPoint[];
  isVi: boolean;
}) {
  const recent = days.slice(-28);
  if (recent.length === 0) return null;

  const activeCount = recent.filter((d) => d.focusMinutes > 0).length;
  const totalFocus = recent.reduce((acc, d) => acc + d.focusMinutes, 0);
  const peakDay = recent.reduce<DayPoint | null>(
    (best, d) => (!best || d.focusMinutes > best.focusMinutes ? d : best),
    null,
  );

  return (
    <section
      aria-label={isVi ? "Bản đồ nhiệt Kỷ luật" : "Discipline Rhythm Heatmap"}
      className="spotlight-card mt-4 rounded-[20px] border border-line bg-surface/94 p-5 shadow-card backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Flame className="size-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[13px] font-semibold text-ink">
              {isVi
                ? `Bản đồ nhiệt Kỷ luật (${recent.length} ngày)`
                : `Discipline Heatmap (${recent.length} days)`}
            </h2>
            <p className="text-[11px] text-muted">
              {isVi
                ? `${activeCount}/${recent.length} ngày có tập trung · Tổng ${formatMinutes(totalFocus)}${
                    peakDay && peakDay.focusMinutes > 0
                      ? ` · Đỉnh ${formatMinutes(peakDay.focusMinutes)}`
                      : ""
                  }`
                : `${activeCount}/${recent.length} active days · ${formatMinutes(totalFocus)} total${
                    peakDay && peakDay.focusMinutes > 0
                      ? ` · Peak ${formatMinutes(peakDay.focusMinutes)}`
                      : ""
                  }`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-[10.5px] text-muted">
          <span>{isVi ? "Ít" : "Less"}</span>
          {[0, 15, 45, 90, 140].map((sample) => (
            <span
              key={sample}
              className={cn("size-3 rounded-[4px] border", intensityClass(sample))}
              aria-hidden="true"
            />
          ))}
          <span>{isVi ? "Nhiều" : "More"}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2 sm:grid-cols-14">
        {recent.map((day) => {
          const tooltip = isVi
            ? `${day.label} (${day.date}): ${formatMinutes(day.focusMinutes)} tập trung · ${day.tasksCompleted} việc xong`
            : `${day.label} (${day.date}): ${formatMinutes(day.focusMinutes)} focus · ${day.tasksCompleted} tasks done`;
          return (
            <div
              key={day.date}
              title={tooltip}
              aria-label={tooltip}
              className={cn(
                "group relative flex aspect-square flex-col items-center justify-center rounded-lg border text-[10px] font-medium transition-transform hover:scale-105",
                intensityClass(day.focusMinutes),
                day.focusMinutes >= 60 ? "text-white" : "text-muted",
              )}
            >
              <span className="tabular-nums">{day.date.slice(-2)}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
