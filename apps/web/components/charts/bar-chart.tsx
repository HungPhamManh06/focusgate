import { cn } from "@/lib/utils";

export interface BarPoint {
  label: string;
  value: number;
}

export function BarChart({
  data,
  tone = "accent",
  formatValue,
  emptyLabel = "No data in this period yet.",
  height = 176,
}: {
  data: BarPoint[];
  tone?: "accent" | "ink";
  formatValue: (value: number) => string;
  emptyLabel?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((point) => point.value), 1);
  const hasData = data.some((point) => point.value > 0);
  const step = data.length > 45 ? 15 : data.length > 14 ? 5 : 1;

  if (!hasData) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-line text-[12px] text-muted"
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between pb-3">
        <p className="text-[10.5px] text-muted">Peak {formatValue(max)}</p>
        <p className="text-[10.5px] text-muted">0</p>
      </div>
      <div className="relative" style={{ height }}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3].map((line) => (
            <span key={line} className="h-px w-full bg-line/60" />
          ))}
        </div>
        <div className="relative flex h-full items-end gap-[2px]">
          {data.map((point, index) => (
            <div
              key={`${point.label}-${index}`}
              className="group flex h-full flex-1 items-end"
              title={`${point.label}: ${formatValue(point.value)}`}
            >
              <div
                className={cn(
                  "w-full rounded-t-[3px] transition-colors",
                  point.value > 0
                    ? tone === "accent"
                      ? "bg-accent group-hover:bg-accent-strong"
                      : "bg-ink/60 group-hover:bg-ink"
                    : "bg-line/50",
                )}
                style={{ height: point.value > 0 ? `${Math.max(3, (point.value / max) * 100)}%` : 2 }}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex gap-[2px]">
        {data.map((point, index) => (
          <div key={`${point.label}-label-${index}`} className="flex-1 overflow-visible">
            {index % step === 0 ? (
              <p className="whitespace-nowrap text-center text-[9.5px] text-muted">{point.label}</p>
            ) : (
              <p className="text-center text-[9.5px] text-transparent">·</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
