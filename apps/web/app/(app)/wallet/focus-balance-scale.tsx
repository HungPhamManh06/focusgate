"use client";

import { Scale } from "lucide-react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

export function FocusBalanceScale({
  earnedMinutes,
  consumedMinutes,
}: {
  earnedMinutes: number;
  consumedMinutes: number;
}) {
  const isVi = useLocale() === "vi";
  const total = Math.max(1, earnedMinutes + consumedMinutes);
  const ratio = (earnedMinutes - consumedMinutes) / total; // -1..1
  const tiltDeg = Math.max(-14, Math.min(14, -ratio * 14));

  return (
    <Card className="mt-4 fg-bento-glow">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-accent" />
          <div>
            <CardTitle>
              {isVi ? "Cán cân Tập trung ↔ Giải trí" : "Focus ↔ Leisure Balance Scale"}
            </CardTitle>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {earnedMinutes >= consumedMinutes
                ? isVi
                  ? "Thặng dư kỷ luật: bạn đang tích lũy nhiều hơn mức chi tiêu."
                  : "Discipline surplus: you are earning more than you spend."
                : isVi
                  ? "Đang chi nhiều hơn tích lũy — hãy thêm một phiên tập trung sâu."
                  : "Spending outpaces earning — add a verified focus block."}
            </p>
          </div>
        </div>
        <span className="font-mono text-[11.5px] font-semibold text-accent tabular-nums">
          +{formatMinutes(earnedMinutes)} / -{formatMinutes(consumedMinutes)}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col items-center pt-2">
        <svg viewBox="0 0 260 96" className="h-[92px] w-full max-w-[300px]" role="img" aria-label="Balance scale">
          {/* Base & Pillar */}
          <line x1="92" y1="88" x2="168" y2="88" stroke="var(--line-strong)" strokeWidth="4" strokeLinecap="round" />
          <line x1="130" y1="88" x2="130" y2="26" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="130" cy="26" r="5" fill="var(--accent)" />
          {/* Tilting Beam */}
          <g transform={`rotate(${tiltDeg.toFixed(1)} 130 26)`}>
            <line x1="48" y1="26" x2="212" y2="26" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
            <circle cx="48" cy="26" r="4" fill="var(--success)" />
            <circle cx="212" cy="26" r="4" fill="var(--accent)" />
            <path d="M 32 54 Q 48 64 64 54" fill="none" stroke="var(--success)" strokeWidth="3" strokeLinecap="round" />
            <line x1="48" y1="26" x2="36" y2="54" stroke="var(--line-strong)" strokeWidth="1.5" />
            <line x1="48" y1="26" x2="60" y2="54" stroke="var(--line-strong)" strokeWidth="1.5" />
            <path d="M 196 54 Q 212 64 228 54" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            <line x1="212" y1="26" x2="200" y2="54" stroke="var(--line-strong)" strokeWidth="1.5" />
            <line x1="212" y1="26" x2="224" y2="54" stroke="var(--line-strong)" strokeWidth="1.5" />
          </g>
        </svg>
        <div className="mt-1 flex w-full max-w-[300px] items-center justify-between text-[11px] font-medium">
          <span className="text-success">
            {isVi ? "Tích lũy" : "Earned"}: {formatMinutes(earnedMinutes)}
          </span>
          <span className="text-accent">
            {isVi ? "Giải trí" : "Spent"}: {formatMinutes(consumedMinutes)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
