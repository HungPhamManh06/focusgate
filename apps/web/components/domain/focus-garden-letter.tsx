"use client";

import { Check, Copy, Feather, Sprout } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

export function FocusGardenAndLetter({
  displayName,
  periodDays,
  focusMinutes,
  tasksCompleted,
  currentStreak,
  bestDayLabel,
  bestDayMinutes,
  locale = "en",
}: {
  displayName: string;
  periodDays: number;
  focusMinutes: number;
  tasksCompleted: number;
  currentStreak: number;
  bestDayLabel: string | null;
  bestDayMinutes: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [copied, setCopied] = useState(false);

  const stage =
    focusMinutes >= 900
      ? 5
      : focusMinutes >= 480
        ? 4
        : focusMinutes >= 240
          ? 3
          : focusMinutes >= 90
            ? 2
            : 1;

  const stageLabel = isVi
    ? ["Hạt giống Tĩnh tại", "Chồi non Kỷ luật", "Vườn Trà Thanh tĩnh", "Cổng Đá Vững chãi", "Thánh đường Sâu sắc"][stage - 1]
    : ["Still Seed", "Discipline Sprout", "Serene Courtyard", "Stone Gatehouse", "Deep Sanctuary"][stage - 1];

  const letterText = isVi
    ? `Chào ${displayName}, trong ${periodDays} ngày qua bạn đã bảo vệ thành công ${formatMinutes(focusMinutes)} tập trung sâu và hoàn tất ${tasksCompleted} nhiệm vụ${currentStreak > 0 ? `, duy trì chuỗi ${currentStreak} ngày kỷ luật` : ""}${bestDayLabel ? `. Đỉnh cao rơi vào ${bestDayLabel} (${formatMinutes(bestDayMinutes)})` : ""}. Hãy giữ nhịp độ bình tĩnh này cho chặng tiếp theo.`
    : `Dear ${displayName}, over the last ${periodDays} days you protected ${formatMinutes(focusMinutes)} of verified deep work and closed ${tasksCompleted} tasks${currentStreak > 0 ? `, holding a ${currentStreak}-day discipline streak` : ""}${bestDayLabel ? `. Your peak came on ${bestDayLabel} (${formatMinutes(bestDayMinutes)})` : ""}. Carry this calm momentum into your next block.`;

  async function copyLetter() {
    try {
      await navigator.clipboard.writeText(letterText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* #2 Focus Garden SVG */}
      <Card className="fg-bento-glow overflow-hidden">
        <CardHeader className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sprout className="size-4 text-accent" />
            <div>
              <CardTitle>{isVi ? "Khu vườn Kỷ luật" : "Architectural Focus Garden"}</CardTitle>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {isVi ? `Cấp ${stage}/5 · ${stageLabel}` : `Stage ${stage}/5 · ${stageLabel}`}
              </p>
            </div>
          </div>
          <span className="rounded-full border border-accent/30 bg-accent-soft px-2.5 py-0.5 font-mono text-[11px] font-semibold text-accent tabular-nums">
            {formatMinutes(focusMinutes)}
          </span>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface-2/80 via-surface to-surface-2/50 p-3">
            <svg viewBox="0 0 360 120" className="h-[118px] w-full" role="img" aria-label="Focus Garden">
              {/* Horizon & Ground */}
              <line x1="16" y1="102" x2="344" y2="102" stroke="var(--line)" strokeWidth="2" />
              {/* Architectural Gate Pillars */}
              <rect x="148" y={stage >= 3 ? 34 : 56} width="10" height={stage >= 3 ? 68 : 46} rx="3" fill="var(--ink)" opacity="0.78" />
              <rect x="202" y={stage >= 3 ? 34 : 56} width="10" height={stage >= 3 ? 68 : 46} rx="3" fill="var(--ink)" opacity="0.78" />
              <rect x="136" y={stage >= 3 ? 28 : 50} width="88" height="8" rx="4" fill="var(--accent)" />
              {/* Glowing Sun / Lantern */}
              {stage >= 2 ? (
                <circle cx="180" cy={stage >= 4 ? 54 : 74} r={stage >= 5 ? 15 : 10} fill="var(--accent)" opacity="0.24" />
              ) : null}
              <circle cx="180" cy={stage >= 4 ? 54 : 74} r={stage >= 4 ? 7 : 4.5} fill="var(--accent)" />
              {/* Left & Right Growing Trees */}
              {stage >= 2 ? (
                <g opacity="0.85">
                  <line x1="88" y1="102" x2="88" y2="66" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="88" cy="58" r={10 + stage * 2} fill="var(--accent)" opacity="0.28" />
                  <circle cx="88" cy="60" r={6 + stage} fill="var(--accent)" opacity="0.5" />
                </g>
              ) : null}
              {stage >= 3 ? (
                <g opacity="0.85">
                  <line x1="272" y1="102" x2="272" y2="62" stroke="var(--ink)" strokeWidth="3" strokeLinecap="round" />
                  <circle cx="272" cy="54" r={10 + stage * 2} fill="var(--accent)" opacity="0.28" />
                  <circle cx="272" cy="56" r={6 + stage} fill="var(--accent)" opacity="0.5" />
                </g>
              ) : null}
              {stage >= 5 ? (
                <g opacity="0.65">
                  <circle cx="52" cy="30" r="2.5" fill="var(--accent)" />
                  <circle cx="308" cy="26" r="2.5" fill="var(--accent)" />
                  <circle cx="240" cy="22" r="2" fill="var(--accent)" />
                </g>
              ) : null}
            </svg>
          </div>
        </CardContent>
      </Card>

      {/* #5 Weekly Editorial Discipline Letter */}
      <Card className="fg-bento-glow flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Feather className="size-4 text-accent" />
            <CardTitle>{isVi ? "Bức thư Kỷ luật Tuần" : "Editorial Discipline Letter"}</CardTitle>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLetter()}>
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
            {copied ? (isVi ? "Đã chép" : "Copied") : isVi ? "Sao chép" : "Copy"}
          </Button>
        </CardHeader>
        <CardContent className="pt-2">
          <blockquote className="rounded-2xl border border-line bg-surface-2/40 p-4 font-display text-[15.5px] leading-relaxed text-ink">
            “{letterText}”
          </blockquote>
        </CardContent>
      </Card>
    </div>
  );
}
