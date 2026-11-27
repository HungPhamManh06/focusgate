import { BatteryCharging, BatteryLow, BatteryWarning, Lock } from "lucide-react";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

export function LeisureBatteryBar({
  availableMinutes,
  dailyCapMinutes,
  expiringSoonCount,
  isVi,
}: {
  availableMinutes: number;
  dailyCapMinutes: number;
  expiringSoonCount: number;
  isVi: boolean;
}) {
  const cap = Math.max(30, dailyCapMinutes);
  const pct = Math.max(0, Math.min(100, Math.round((availableMinutes / cap) * 100)));
  const isEmpty = availableMinutes <= 0;
  const isLow = !isEmpty && pct <= 20;

  return (
    <section
      aria-label={isVi ? "Thanh Pin Giải trí" : "Leisure Battery Level"}
      className="spotlight-card mt-4 rounded-[20px] border border-line bg-surface/94 px-5 py-4 shadow-card backdrop-blur-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {isEmpty ? (
            <Lock className="size-4 text-muted" />
          ) : isLow ? (
            <BatteryLow className="size-4 text-amber-500" />
          ) : (
            <BatteryCharging className="size-4 text-success" />
          )}
          <span className="text-[12.5px] font-semibold text-ink">
            {isVi ? "Pin Giải trí khả dụng" : "Leisure Battery"}
          </span>
          <span className="font-mono text-[12px] font-semibold text-accent tabular-nums">
            {formatMinutes(availableMinutes)} / {formatMinutes(cap)}
          </span>
        </div>

        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
            isEmpty
              ? "border border-line bg-surface-2 text-muted"
              : isLow
                ? "border border-warning/30 bg-warning-soft text-warning"
                : "border border-success/30 bg-success-soft text-success",
          )}
        >
          {expiringSoonCount > 0 && !isEmpty ? <BatteryWarning className="size-3" /> : null}
          {isEmpty
            ? isVi
              ? "Cổng đang khóa · Hoàn thành việc để sạc pin"
              : "Gate locked · Complete tasks to recharge"
            : isLow
              ? isVi
                ? "Pin sắp cạn — chủ động dừng đúng giờ nhé"
                : "Low battery — wrap up leisure cleanly"
              : expiringSoonCount > 0
                ? isVi
                  ? `Dồi dào (${pct}%) · Có ${expiringSoonCount} gói sắp hết hạn`
                  : `Charged (${pct}%) · ${expiringSoonCount} grant expiring soon`
                : isVi
                  ? `Sẵn sàng sử dụng (${pct}%)`
                  : `Ready to spend (${pct}%)`}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        <div className="relative h-3.5 flex-1 overflow-hidden rounded-full border border-line bg-surface-2 p-0.5">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-700 ease-out",
              isEmpty
                ? "bg-muted/30"
                : isLow
                  ? "bg-gradient-to-r from-amber-500 to-amber-400"
                  : "bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400",
            )}
            style={{ width: `${Math.max(isEmpty ? 0 : 4, pct)}%` }}
          />
        </div>
        <div className="h-2.5 w-1 rounded-r-sm bg-line" aria-hidden="true" />
      </div>
    </section>
  );
}
