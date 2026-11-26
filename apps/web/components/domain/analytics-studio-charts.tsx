"use client";

import { ArrowDownRight, ArrowUpRight, PieChart, Radar } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCategoryLabel } from "@/components/domain/labels";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

type DayPoint = {
  date: string;
  focusMinutes: number;
  tasksCompleted: number;
};

type CategorySlice = {
  category: string;
  minutes: number;
};

const SLICE_COLORS = [
  "#b91c1c",
  "#2563eb",
  "#0d7a58",
  "#d97706",
  "#7c3aed",
  "#0891b2",
];

export function AnalyticsStudioCharts({
  days,
  categoryBreakdown,
  completionRate,
  avgSleepMinutes,
  avgSteps,
  currentStreak,
  locale = "en",
}: {
  days: DayPoint[];
  categoryBreakdown: CategorySlice[];
  completionRate: number;
  avgSleepMinutes: number;
  avgSteps: number;
  currentStreak: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [hoveredCat, setHoveredCat] = useState<string | null>(null);

  // Split period in half for Delta comparison
  const mid = Math.max(1, Math.floor(days.length / 2));
  const prevHalf = days.slice(0, mid);
  const currHalf = days.slice(mid);
  const prevFocus = prevHalf.reduce((s, d) => s + d.focusMinutes, 0);
  const currFocus = currHalf.reduce((s, d) => s + d.focusMinutes, 0);
  const focusDeltaPct =
    prevFocus > 0 ? Math.round(((currFocus - prevFocus) / prevFocus) * 100) : currFocus > 0 ? 100 : 0;

  const prevTasks = prevHalf.reduce((s, d) => s + d.tasksCompleted, 0);
  const currTasks = currHalf.reduce((s, d) => s + d.tasksCompleted, 0);
  const tasksDelta = currTasks - prevTasks;

  // 5-axis Radar scores (0..100)
  const avgFocusDay = days.length > 0 ? days.reduce((s, d) => s + d.focusMinutes, 0) / days.length : 0;
  const axes = [
    { label: isVi ? "Tập trung" : "Focus", value: Math.min(100, Math.round((avgFocusDay / 90) * 100)) },
    { label: isVi ? "Hoàn thành" : "Tasks", value: Math.min(100, completionRate) },
    {
      label: isVi ? "Giấc ngủ" : "Sleep",
      value: avgSleepMinutes > 0 ? Math.min(100, Math.round((avgSleepMinutes / 450) * 100)) : 50,
    },
    {
      label: isVi ? "Vận động" : "Steps",
      value: avgSteps > 0 ? Math.min(100, Math.round((avgSteps / 8000) * 100)) : 45,
    },
    { label: isVi ? "Chuỗi ngày" : "Streak", value: Math.min(100, Math.round((currentStreak / 14) * 100)) },
  ];

  const cx = 100;
  const cy = 100;
  const maxR = 68;
  const polar = (idx: number, r: number) => {
    const angle = (Math.PI * 2 * idx) / axes.length - Math.PI / 2;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };
  const polygonPoints = axes
    .map((a, idx) => {
      const [x, y] = polar(idx, (Math.max(12, a.value) / 100) * maxR);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // Donut Ring math
  const totalCatMins = categoryBreakdown.reduce((s, c) => s + c.minutes, 0);
  const donutRadius = 56;
  const donutCirc = 2 * Math.PI * donutRadius;
  let accOffset = 0;
  const slices = categoryBreakdown.map((item, idx) => {
    const frac = totalCatMins > 0 ? item.minutes / totalCatMins : 0;
    const length = frac * donutCirc;
    const offset = accOffset;
    accOffset += length;
    return {
      ...item,
      pct: Math.round(frac * 100),
      length,
      offset,
      color: SLICE_COLORS[idx % SLICE_COLORS.length]!,
    };
  });
  const activeSlice = slices.find((s) => s.category === hoveredCat) ?? slices[0] ?? null;

  return (
    <section className="mt-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-line bg-surface px-4 py-3 text-[12px]">
        <span className="font-semibold text-ink">
          {isVi ? "Xu hướng so với nửa kỳ trước:" : "Momentum vs. prior half:"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold",
            focusDeltaPct >= 0
              ? "bg-success-soft text-success"
              : "bg-danger-soft text-danger",
          )}
        >
          {focusDeltaPct >= 0 ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {focusDeltaPct >= 0 ? `+${focusDeltaPct}%` : `${focusDeltaPct}%`}{" "}
          {isVi ? "tập trung" : "focus"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold",
            tasksDelta >= 0 ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
          )}
        >
          {tasksDelta >= 0 ? `+${tasksDelta}` : tasksDelta} {isVi ? "nhiệm vụ" : "tasks"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Radar className="size-4 text-accent" />
                {isVi ? "Cân bằng 5 Trụ cột Kỷ luật" : "5-Pillar Discipline Radar"}
              </CardTitle>
              <p className="mt-1 text-[12px] text-muted">
                {isVi
                  ? "Tổng hòa giữa Tập trung, Hoàn thành, Giấc ngủ, Vận động & Chuỗi ngày."
                  : "Balance across Focus, Completion, Sleep, Movement & Streak."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center pt-2 sm:flex-row sm:justify-around">
            <svg viewBox="0 0 200 200" className="size-48 shrink-0">
              {[0.33, 0.66, 1].map((ring) => (
                <polygon
                  key={ring}
                  points={axes
                    .map((_, i) => {
                      const [x, y] = polar(i, maxR * ring);
                      return `${x.toFixed(1)},${y.toFixed(1)}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke="var(--line)"
                  strokeWidth="1"
                />
              ))}
              {axes.map((a, i) => {
                const [x, y] = polar(i, maxR);
                const [lx, ly] = polar(i, maxR + 18);
                return (
                  <g key={a.label}>
                    <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line)" strokeWidth="1" />
                    <text
                      x={lx}
                      y={ly}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-current text-[9px] font-medium text-muted"
                    >
                      {a.label}
                    </text>
                  </g>
                );
              })}
              <polygon
                points={polygonPoints}
                fill="var(--accent)"
                fillOpacity="0.22"
                stroke="var(--accent)"
                strokeWidth="2"
              />
            </svg>
            <div className="grid w-full max-w-[180px] gap-1.5 text-[11.5px]">
              {axes.map((a) => (
                <div key={a.label} className="flex items-center justify-between">
                  <span className="text-muted">{a.label}</span>
                  <span className="font-semibold tabular-nums text-ink">{a.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <PieChart className="size-4 text-accent" />
                {isVi ? "Vòng phân bổ Danh mục" : "Category Focus Donut"}
              </CardTitle>
              <p className="mt-1 text-[12px] text-muted">
                {isVi
                  ? "Di chuột vào từng lát cắt để xem tỷ lệ thời gian tập trung."
                  : "Hover any slice to inspect verified focus share."}
              </p>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:justify-around">
            {slices.length === 0 ? (
              <p className="py-10 text-[12px] text-muted">
                {isVi ? "Chưa có dữ liệu danh mục trong kỳ này." : "No category data in this period."}
              </p>
            ) : (
              <>
                <div className="relative flex size-44 shrink-0 items-center justify-center">
                  <svg viewBox="0 0 144 144" className="size-44 -rotate-90">
                    {slices.map((s) => (
                      <circle
                        key={s.category}
                        cx="72"
                        cy="72"
                        r={donutRadius}
                        fill="none"
                        stroke={s.color}
                        strokeWidth={hoveredCat === s.category ? 20 : 16}
                        strokeDasharray={`${s.length} ${donutCirc - s.length}`}
                        strokeDashoffset={-s.offset}
                        className="cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredCat(s.category)}
                      />
                    ))}
                  </svg>
                  {activeSlice ? (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                      <span className="font-display text-[22px] leading-none text-ink">
                        {activeSlice.pct}%
                      </span>
                      <span className="mt-1 max-w-[85px] truncate text-[10.5px] text-muted">
                        {activeSlice.category === "free_focus"
                          ? isVi
                            ? "Tự do"
                            : "Free"
                          : getCategoryLabel(activeSlice.category, locale)}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="w-full max-w-[190px] space-y-1.5 text-[11.5px]">
                  {slices.map((s) => (
                    <button
                      key={s.category}
                      type="button"
                      onMouseEnter={() => setHoveredCat(s.category)}
                      onFocus={() => setHoveredCat(s.category)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
                        <span className="truncate text-ink-soft">
                          {s.category === "free_focus"
                            ? isVi
                              ? "Tập trung tự do"
                              : "Free focus"
                            : getCategoryLabel(s.category, locale)}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-ink">
                        {formatMinutes(s.minutes)}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
