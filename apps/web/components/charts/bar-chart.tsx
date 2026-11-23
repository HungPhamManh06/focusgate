"use client";

import { useState } from "react";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

export interface BarPoint {
  label: string;
  value: number;
}

export type BarChartUnit = "minutes" | "steps" | "kcal" | "kg10";

function formatByUnit(value: number, unit: BarChartUnit): string {
  switch (unit) {
    case "steps":
      return `${value.toLocaleString()} steps`;
    case "kcal":
      return `${value} kcal`;
    case "kg10":
      return `${(value / 10).toFixed(1)} kg`;
    default:
      return formatMinutes(value);
  }
}

export function BarChart({
  data,
  tone = "accent",
  unit = "minutes",
  formatValue,
  emptyLabel = "No data in this period yet.",
  height = 176,
}: {
  data: BarPoint[];
  tone?: "accent" | "ink";
  unit?: BarChartUnit;
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  height?: number;
}) {
  const renderValue = formatValue ?? ((value: number) => formatByUnit(value, unit));
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const max = Math.max(...data.map((point) => point.value), 1);
  const hasData = data.some((point) => point.value > 0);
  const step = data.length > 45 ? 10 : data.length > 14 ? 5 : 1;
  const scrollable = data.length > 30;
  const activePoint = activeIndex !== null ? data[activeIndex] : null;

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
        <p className="text-[10.5px] text-muted tabular-nums">
          {activePoint ? (
            <span className="font-medium text-ink">
              {activePoint.label}: {renderValue(activePoint.value)}
            </span>
          ) : (
            <>Peak {renderValue(max)}</>
          )}
        </p>
        <p className="text-[10.5px] text-muted">
          {scrollable ? "Scroll horizontally · 0" : "0"}
        </p>
      </div>

      <div className={cn(scrollable && "-mx-1 overflow-x-auto px-1 pb-1")}>
        <div style={scrollable ? { minWidth: `${Math.max(540, data.length * 8)}px` } : undefined}>
          <div className="relative" style={{ height }}>
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
              {[0, 1, 2, 3].map((line) => (
                <span key={line} className="h-px w-full bg-line/60" />
              ))}
            </div>
            <div
              className="relative flex h-full items-end gap-[2px]"
              onMouseLeave={() => setActiveIndex(null)}
            >
              {data.map((point, index) => {
                const isActive = activeIndex === index;
                return (
                  <button
                    key={`${point.label}-${index}`}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onFocus={() => setActiveIndex(index)}
                    onBlur={() => setActiveIndex(null)}
                    onClick={() => setActiveIndex(isActive ? null : index)}
                    aria-label={`${point.label}: ${renderValue(point.value)}`}
                    className="group relative flex h-full flex-1 items-end focus:outline-none"
                  >
                    <div
                      className={cn(
                        "mx-auto w-full max-w-[48px] rounded-t-[3px] transition-colors",
                        point.value > 0
                          ? tone === "accent"
                            ? isActive
                              ? "bg-accent-strong"
                              : "bg-accent group-hover:bg-accent-strong"
                            : isActive
                              ? "bg-ink"
                              : "bg-ink/60 group-hover:bg-ink"
                          : isActive
                            ? "bg-ink/30"
                            : "bg-line/50",
                      )}
                      style={{
                        height:
                          point.value > 0 ? `${Math.max(4, (point.value / max) * 100)}%` : 2,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-2 flex gap-[2px]">
            {data.map((point, index) => (
              <div key={`${point.label}-label-${index}`} className="flex-1 overflow-visible">
                {index % step === 0 ? (
                  <p className="whitespace-nowrap text-center text-[9.5px] text-muted tabular-nums">
                    {point.label}
                  </p>
                ) : (
                  <p className="text-center text-[9.5px] text-transparent">·</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
