import { AlertTriangle, CheckCircle2, Gauge } from "lucide-react";
import { formatMinutes } from "@/lib/data/format";
import type { TaskKind } from "@/lib/data/types";
import { cn } from "@/lib/utils";

const WORKDAY_CAPACITY_MINUTES = 480; // 8 hours
const HEAVY_THRESHOLD_MINUTES = 360; // 6 hours

export function PlannerCapacityBar({
  tasks,
  isVi,
}: {
  tasks: { kind: TaskKind; requiredFocusMinutes: number; completedAt: string | null }[];
  isVi: boolean;
}) {
  let mustDoMin = 0;
  let shouldDoMin = 0;
  let bonusMin = 0;

  for (const t of tasks) {
    const mins = Math.max(15, t.requiredFocusMinutes || 30);
    if (t.kind === "must_do") mustDoMin += mins;
    else if (t.kind === "should_do") shouldDoMin += mins;
    else bonusMin += mins;
  }

  const totalMin = mustDoMin + shouldDoMin + bonusMin;
  const scaleDenom = Math.max(WORKDAY_CAPACITY_MINUTES, totalMin);
  const mustPct = (mustDoMin / scaleDenom) * 100;
  const shouldPct = (shouldDoMin / scaleDenom) * 100;
  const bonusPct = (bonusMin / scaleDenom) * 100;
  const sixHourMarkerPct = (HEAVY_THRESHOLD_MINUTES / scaleDenom) * 100;

  const isOverloaded = totalMin > WORKDAY_CAPACITY_MINUTES;
  const isHeavy = !isOverloaded && totalMin > HEAVY_THRESHOLD_MINUTES;
  const remainingMin = Math.max(0, WORKDAY_CAPACITY_MINUTES - totalMin);

  return (
    <section
      aria-label={isVi ? "Thanh sức chứa ngày làm việc" : "Daily work capacity bar"}
      className="spotlight-card rounded-2xl border border-line bg-surface/92 px-5 py-4 shadow-card backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="size-4 text-accent" strokeWidth={1.9} />
          <p className="text-[12.5px] font-semibold text-ink">
            {isVi ? "Sức chứa ngày làm việc (8h)" : "Daily capacity (8h workday)"}
          </p>
          <span className="font-mono text-[11.5px] font-medium text-muted tabular-nums">
            {formatMinutes(totalMin)} / {formatMinutes(WORKDAY_CAPACITY_MINUTES)}
          </span>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            isOverloaded
              ? "border border-danger/25 bg-danger-soft text-danger"
              : isHeavy
                ? "border border-warning/25 bg-warning-soft text-warning"
                : totalMin > 0
                  ? "border border-success/25 bg-success-soft text-success"
                  : "border border-line bg-surface-2 text-muted",
          )}
        >
          {isOverloaded || isHeavy ? (
            <AlertTriangle className="size-3" />
          ) : (
            <CheckCircle2 className="size-3" />
          )}
          {isOverloaded
            ? isVi
              ? "Quá tải (>8h) — cân nhắc giảm bớt việc"
              : "Overloaded (>8h) — consider trimming tasks"
            : isHeavy
              ? isVi
                ? "Nhịp cao (>6h) — ưu tiên khối tập trung sâu"
                : "Heavy load (>6h) — guard deep focus blocks"
              : totalMin > 0
                ? isVi
                  ? `Cân bằng · còn dư ${formatMinutes(remainingMin)}`
                  : `Balanced · ${formatMinutes(remainingMin)} headroom`
                : isVi
                  ? "Chưa phân bổ thời lượng"
                  : "No tasks scheduled yet"}
        </span>
      </div>

      <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="flex h-full w-full">
          {mustPct > 0 ? (
            <div
              className="h-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${mustPct.toFixed(2)}%` }}
              title={`${isVi ? "Bắt buộc" : "Must-do"}: ${formatMinutes(mustDoMin)}`}
            />
          ) : null}
          {shouldPct > 0 ? (
            <div
              className="h-full bg-amber-500 transition-[width] duration-500 ease-out"
              style={{ width: `${shouldPct.toFixed(2)}%` }}
              title={`${isVi ? "Nên làm" : "Should-do"}: ${formatMinutes(shouldDoMin)}`}
            />
          ) : null}
          {bonusPct > 0 ? (
            <div
              className="h-full bg-success transition-[width] duration-500 ease-out"
              style={{ width: `${bonusPct.toFixed(2)}%` }}
              title={`${isVi ? "Thưởng" : "Bonus"}: ${formatMinutes(bonusMin)}`}
            />
          ) : null}
        </div>
        <span
          title={isVi ? "Ngưỡng tối ưu 6 giờ" : "6h optimal focus threshold"}
          className="pointer-events-none absolute bottom-0 top-0 w-px bg-ink/25"
          style={{ left: `${sixHourMarkerPct.toFixed(2)}%` }}
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-accent" />
          {isVi ? "Bắt buộc" : "Must-do"}:{" "}
          <strong className="font-medium text-ink tabular-nums">{formatMinutes(mustDoMin)}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-amber-500" />
          {isVi ? "Nên làm" : "Should-do"}:{" "}
          <strong className="font-medium text-ink tabular-nums">{formatMinutes(shouldDoMin)}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-success" />
          {isVi ? "Thưởng" : "Bonus"}:{" "}
          <strong className="font-medium text-ink tabular-nums">{formatMinutes(bonusMin)}</strong>
        </span>
      </div>
    </section>
  );
}
