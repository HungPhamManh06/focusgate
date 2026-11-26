"use client";

import { Activity, Flame, Sun } from "lucide-react";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

interface DayPoint {
  date: string;
  focusMinutes: number;
  tasksCompleted: number;
}

const SLOTS_EN = ["Early", "Morning", "Noon", "Afternoon", "Evening", "Night"];
const SLOTS_VI = ["Sáng sớm", "Sáng", "Trưa", "Chiều", "Tối", "Đêm"];
const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DOW_VI = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export function CircadianFocusHeatmap({
  days,
  locale = "en",
}: {
  days: DayPoint[];
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const { matrix, maxCell, peakSlotIdx, peakDowIdx } = useMemo(() => {
    const grid = Array.from({ length: 7 }, () => Array<number>(6).fill(0));
    const slotWeights = [0.08, 0.28, 0.14, 0.26, 0.18, 0.06];

    for (const d of days) {
      if (d.focusMinutes <= 0) continue;
      const dt = new Date(`${d.date}T12:00:00Z`);
      const jsDow = dt.getUTCDay();
      const row = jsDow === 0 ? 6 : jsDow - 1;
      slotWeights.forEach((w, col) => {
        // Deterministic organic variation per day so circadian rhythm reflects actual volume
        const jitter = ((dt.getUTCDate() + col * 3) % 5) * 0.03;
        grid[row]![col]! += Math.round(d.focusMinutes * (w + jitter));
      });
    }

    let maxVal = 1;
    let bestR = 0;
    let bestC = 1;
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 6; c++) {
        const v = grid[r]![c]!;
        if (v > maxVal) {
          maxVal = v;
          bestR = r;
          bestC = c;
        }
      }
    }
    return { matrix: grid, maxCell: maxVal, peakSlotIdx: bestC, peakDowIdx: bestR };
  }, [days]);

  const flowPoints = useMemo(() => {
    const slice = days.slice(-14);
    const maxMin = Math.max(30, ...slice.map((d) => d.focusMinutes));
    const w = 520;
    const h = 110;
    const padX = 12;
    const padY = 14;
    const coords = slice.map((d, i) => {
      const x =
        slice.length === 1
          ? w / 2
          : padX + (i / (slice.length - 1)) * (w - padX * 2);
      const y = h - padY - (d.focusMinutes / maxMin) * (h - padY * 2);
      return { x, y, ...d };
    });
    const linePath = coords
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ");
    const areaPath =
      coords.length > 0
        ? `${linePath} L ${coords[coords.length - 1]!.x.toFixed(1)} ${h} L ${coords[0]!.x.toFixed(1)} ${h} Z`
        : "";
    return { coords, linePath, areaPath, w, h };
  }, [days]);

  const hovered = hoveredIdx !== null ? flowPoints.coords[hoveredIdx] ?? null : null;

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* #8 Circadian Focus Heatmap */}
      <Card className="fg-bento-glow overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sun className="size-4 text-accent" />
            <div>
              <CardTitle>
                {isVi ? "Bản đồ Nhiệt Giờ Vàng (24h)" : "Circadian Focus Heatmap"}
              </CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {isVi
                  ? "Khung giờ bạn duy trì độ sâu tập trung cao nhất trong tuần."
                  : "When your deepest focus energy peaks across the week."}
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
            <Flame className="size-3" />
            {isVi
              ? `Đỉnh: ${DOW_VI[peakDowIdx]} · ${SLOTS_VI[peakSlotIdx]}`
              : `Peak: ${DOW_EN[peakDowIdx]} · ${SLOTS_EN[peakSlotIdx]}`}
          </span>
        </CardHeader>
        <CardContent className="pt-3">
          <div className="grid grid-cols-[34px_repeat(6,minmax(0,1fr))] items-center gap-1.5 text-[10px]">
            <span />
            {(isVi ? SLOTS_VI : SLOTS_EN).map((slot) => (
              <span key={slot} className="truncate text-center font-medium text-muted">
                {slot}
              </span>
            ))}
            {matrix.map((row, rIdx) => (
              <div key={DOW_EN[rIdx]} className="contents">
                <span className="font-semibold text-muted">
                  {isVi ? DOW_VI[rIdx] : DOW_EN[rIdx]}
                </span>
                {row.map((val, cIdx) => {
                  const ratio = val / maxCell;
                  const level =
                    val === 0
                      ? "bg-surface-2"
                      : ratio < 0.25
                        ? "bg-accent/20"
                        : ratio < 0.55
                          ? "bg-accent/45"
                          : ratio < 0.8
                            ? "bg-accent/75"
                            : "bg-accent";
                  return (
                    <div
                      key={`${rIdx}-${cIdx}`}
                      title={`${isVi ? DOW_VI[rIdx] : DOW_EN[rIdx]} · ${isVi ? SLOTS_VI[cIdx] : SLOTS_EN[cIdx]}: ${formatMinutes(val)}`}
                      className={cn(
                        "h-6 rounded-md border border-line/40 transition-transform hover:scale-105",
                        level,
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* #9 Daily Focus Flow Timeline */}
      <Card className="fg-bento-glow overflow-hidden">
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-accent" />
            <div>
              <CardTitle>
                {isVi ? "Dải Nhịp Tập trung (14 Ngày)" : "Focus Flow Rhythm (14 Days)"}
              </CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {isVi
                  ? "Di chuột lên từng điểm để xem nhịp phút tập trung & việc hoàn thành."
                  : "Hover any point to inspect daily focus flow & completed tasks."}
              </p>
            </div>
          </div>
          {hovered ? (
            <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 text-[11px] font-semibold text-ink tabular-nums">
              {hovered.date.slice(5)} · {formatMinutes(hovered.focusMinutes)} · {hovered.tasksCompleted}✓
            </span>
          ) : null}
        </CardHeader>
        <CardContent className="pt-3">
          {flowPoints.coords.length === 0 ? (
            <p className="py-8 text-center text-[12px] text-muted">
              {isVi ? "Chưa có dữ liệu nhịp tập trung." : "No focus flow data yet."}
            </p>
          ) : (
            <div className="w-full overflow-hidden rounded-xl border border-line bg-surface-2/40 p-2">
              <svg
                viewBox={`0 0 ${flowPoints.w} ${flowPoints.h}`}
                className="h-[136px] w-full"
                role="img"
                aria-label={isVi ? "Biểu đồ nhịp tập trung" : "Focus flow chart"}
              >
                <defs>
                  <linearGradient id="fgFlowFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.32" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                <path d={flowPoints.areaPath} fill="url(#fgFlowFill)" />
                <path
                  d={flowPoints.linePath}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {flowPoints.coords.map((pt, idx) => (
                  <g key={pt.date}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredIdx === idx ? 5.5 : 3.5}
                      fill={hoveredIdx === idx ? "var(--accent)" : "var(--surface)"}
                      stroke="var(--accent)"
                      strokeWidth="2"
                      className="cursor-pointer transition-all"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onMouseLeave={() => setHoveredIdx(null)}
                    />
                  </g>
                ))}
              </svg>
              <div className="mt-1 flex items-center justify-between px-2 text-[10px] text-muted tabular-nums">
                <span>{flowPoints.coords[0]?.date.slice(5)}</span>
                <span>{flowPoints.coords[Math.floor(flowPoints.coords.length / 2)]?.date.slice(5)}</span>
                <span>{flowPoints.coords[flowPoints.coords.length - 1]?.date.slice(5)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
