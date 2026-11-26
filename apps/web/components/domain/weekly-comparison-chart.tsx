"use client";

import { BarChart2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

interface DayPoint {
  date: string;
  focusMinutes: number;
}

export function WeeklyComparisonChart({
  days,
  locale = "en",
}: {
  days: DayPoint[];
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const current7 = days.slice(-7);
  const prev7 = days.length >= 14 ? days.slice(-14, -7) : [];
  const avgFallback =
    current7.length > 0
      ? Math.round(current7.reduce((a, d) => a + d.focusMinutes, 0) / current7.length)
      : 0;

  const pairs = current7.map((d, idx) => ({
    label: d.date.slice(5),
    cur: d.focusMinutes,
    prev: prev7[idx]?.focusMinutes ?? avgFallback,
  }));

  const maxMin = Math.max(30, ...pairs.flatMap((p) => [p.cur, p.prev]));
  const curTotal = pairs.reduce((a, p) => a + p.cur, 0);
  const prevTotal = pairs.reduce((a, p) => a + p.prev, 0);
  const delta = curTotal - prevTotal;

  return (
    <Card className="mt-4 fg-bento-glow">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="size-4 text-accent" />
          <div>
            <CardTitle>
              {isVi ? "So sánh 7 Ngày (Hiện tại vs. Kỳ trước)" : "7-Day Focus Comparison (Current vs. Baseline)"}
            </CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {isVi
                ? "Cột đậm là 7 ngày gần nhất, cột mờ là kỳ trước (hoặc trung bình kỳ)."
                : "Solid bars show the latest 7 days; muted bars show the prior week or baseline."}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums">
          {delta >= 0 ? `+${formatMinutes(delta)}` : `-${formatMinutes(Math.abs(delta))}`}
        </span>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="grid grid-cols-7 items-end gap-2 pt-2">
          {pairs.map((p) => {
            const curH = Math.max(4, Math.round((p.cur / maxMin) * 96));
            const prevH = Math.max(4, Math.round((p.prev / maxMin) * 96));
            return (
              <div key={p.label} className="flex flex-col items-center gap-1.5">
                <div className="flex h-[100px] items-end gap-1">
                  <div
                    title={`${p.label} (prev): ${formatMinutes(p.prev)}`}
                    className="w-2.5 rounded-t-md bg-line-strong/65 sm:w-3.5"
                    style={{ height: `${prevH}px` }}
                  />
                  <div
                    title={`${p.label} (now): ${formatMinutes(p.cur)}`}
                    className="w-2.5 rounded-t-md bg-accent sm:w-3.5"
                    style={{ height: `${curH}px` }}
                  />
                </div>
                <span className="text-[10px] font-medium text-muted tabular-nums">{p.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
