"use client";

import { Calculator, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

export function DistractionCostCalculator({
  availableMinutes,
}: {
  availableMinutes: number;
}) {
  const isVi = useLocale() === "vi";
  const [leisureMin, setLeisureMin] = useState(45);

  const deepWork25 = Math.max(1, Math.ceil((leisureMin * 1.5) / 25));
  const deepWork45 = Math.max(1, Math.ceil((leisureMin * 1.5) / 45));
  const affordable = availableMinutes >= leisureMin;

  return (
    <Card className="mt-4 fg-bento-glow">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calculator className="size-4 text-accent" />
          <div>
            <CardTitle>
              {isVi ? "Quy đổi Chi phí Giải trí" : "Distraction Cost Calculator"}
            </CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {isVi
                ? "Kéo để thấy mỗi khoảng giải trí tương đương bao nhiêu phiên Deep Work."
                : "Slide to see how many Deep Work sprints each leisure block costs."}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-semibold tabular-nums">
          <Sparkles className="size-3 text-accent" />
          {affordable
            ? isVi
              ? "Đủ số dư ngay"
              : "Covered by balance"
            : isVi
              ? `Thiếu ${formatMinutes(leisureMin - availableMinutes)}`
              : `Need ${formatMinutes(leisureMin - availableMinutes)} more`}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="flex items-center justify-between text-[12px] font-medium">
          <span className="text-muted">
            {isVi ? "Thời gian giải trí dự định" : "Planned leisure time"}
          </span>
          <span className="font-display text-[22px] text-accent tabular-nums">
            {formatMinutes(leisureMin)}
          </span>
        </div>
        <input
          type="range"
          min={10}
          max={180}
          step={5}
          value={leisureMin}
          onChange={(e) => setLeisureMin(Number(e.target.value))}
          aria-label={isVi ? "Phút giải trí" : "Leisure minutes"}
          className="w-full accent-[var(--accent)]"
        />
        <div className="grid gap-2.5 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-surface-2/50 p-3">
            <p className="text-[11px] text-muted">{isVi ? "Phiên Pomodoro 25p" : "25m Pomodoros"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums">{deepWork25}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-3">
            <p className="text-[11px] text-muted">{isVi ? "Phiên Deep Work 45p" : "45m Deep Blocks"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums">{deepWork45}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface-2/50 p-3">
            <p className="text-[11px] text-muted">{isVi ? "Số dư hiện tại" : "Current balance"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums">
              {formatMinutes(availableMinutes)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
