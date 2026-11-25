"use client";

import { Brain, Flame, MoonStar, ShieldAlert } from "lucide-react";
import type { DayPoint, HourlyPoint } from "@/lib/data/types";
import { computeSleepCorrelation, type HealthSleepDay } from "@/lib/domain/focus-coach";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function DistractionSleepCard({
  days,
  healthDays,
  hourlyFocus,
  blockedAttempts,
}: {
  days: DayPoint[];
  healthDays: HealthSleepDay[];
  hourlyFocus: HourlyPoint[];
  blockedAttempts: number;
}) {
  const isVi = useLocale() === "vi";
  const corr = computeSleepCorrelation(days, healthDays);
  const maxFocus = Math.max(1, ...hourlyFocus.map((h) => h.focusMinutes));

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {/* 24-Hour Attention & Energy Heatmap */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Flame className="size-4 text-accent" />
            {isVi ? "Bản đồ Nhiệt Tập trung 24 Giờ" : "24-Hour Attention Heatmap"}
          </CardTitle>
          <Badge tone={blockedAttempts > 0 ? "warning" : "success"}>
            <ShieldAlert className="mr-1 size-3" />
            {isVi ? `${blockedAttempts} lần chặn` : `${blockedAttempts} blocked`}
          </Badge>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="mb-3 text-[12px] text-muted">
            {isVi
              ? "Ô càng đậm là khung giờ bạn tập trung sâu nhất; các ô nhạt là khung giờ dễ xao nhãng cần bảo vệ."
              : "Darker tiles mark your highest deep-focus hours; lighter tiles show vulnerable distraction windows."}
          </p>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
            {Array.from({ length: 24 }, (_, hour) => {
              const point = hourlyFocus.find((h) => h.hour === hour);
              const mins = point?.focusMinutes ?? 0;
              const ratio = mins / maxFocus;
              const tone =
                mins === 0
                  ? "bg-surface-2/60 text-muted border-line/60"
                  : ratio >= 0.7
                    ? "bg-accent text-white border-accent"
                    : ratio >= 0.35
                      ? "bg-accent/45 text-ink border-accent/40"
                      : "bg-accent-soft text-ink border-accent/20";
              return (
                <div
                  key={hour}
                  title={`${String(hour).padStart(2, "0")}:00 — ${mins}m`}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border py-1.5 text-center",
                    tone,
                  )}
                >
                  <span className="font-mono text-[10px] font-semibold">
                    {String(hour).padStart(2, "0")}h
                  </span>
                  <span className="text-[9.5px] opacity-85">{mins}m</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sleep vs Focus Correlation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MoonStar className="size-4 text-accent" />
            {isVi ? "Tương quan Giấc ngủ & Hiệu suất" : "Sleep vs. Focus Correlation"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {corr.lowSleepDays === 0 && corr.goodSleepDays === 0 ? (
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "Ghi nhận số giờ ngủ ở mục Sức khỏe để FocusGate phân tích tác động của giấc ngủ lên hiệu suất tập trung."
                : "Log your sleep hours in Health to unlock sleep-to-focus correlation analytics."}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-success/25 bg-success-soft/35 p-3">
                  <p className="text-[11px] font-medium text-muted">
                    {isVi ? `Ngủ ≥ 6.5h (${corr.goodSleepDays} ngày)` : `Sleep ≥ 6.5h (${corr.goodSleepDays}d)`}
                  </p>
                  <p className="mt-1 text-[20px] font-bold text-ink">{corr.goodSleepAvgFocus}m</p>
                  <p className="text-[11px] text-muted">
                    {isVi
                      ? `TB ${corr.goodSleepAvgTasks} việc/ngày`
                      : `Avg ${corr.goodSleepAvgTasks} tasks/day`}
                  </p>
                </div>
                <div className="rounded-xl border border-warning/30 bg-warning-soft/35 p-3">
                  <p className="text-[11px] font-medium text-muted">
                    {isVi ? `Ngủ < 6.5h (${corr.lowSleepDays} ngày)` : `Sleep < 6.5h (${corr.lowSleepDays}d)`}
                  </p>
                  <p className="mt-1 text-[20px] font-bold text-ink">{corr.lowSleepAvgFocus}m</p>
                  <p className="text-[11px] text-muted">
                    {isVi
                      ? `TB ${corr.lowSleepAvgTasks} việc/ngày`
                      : `Avg ${corr.lowSleepAvgTasks} tasks/day`}
                  </p>
                </div>
              </div>
              {corr.focusDropPercent !== null && (
                <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-2/50 p-3 text-[12px] text-ink">
                  <Brain className="mt-0.5 size-4 shrink-0 text-accent" />
                  <p>
                    {corr.focusDropPercent > 0
                      ? isVi
                        ? `Những ngày ngủ dưới 6.5 tiếng, thời lượng tập trung sâu của bạn giảm ${corr.focusDropPercent}%. Hãy cân nhắc bật Bedtime Gate (23:00–06:30).`
                        : `On days with < 6.5h sleep, your deep focus drops by ${corr.focusDropPercent}%. Consider enabling Bedtime Gate (23:00–06:30).`
                      : isVi
                        ? "Bạn đang duy trì nhịp tập trung ổn định bất kể biến động giấc ngủ — tiếp tục giữ lịch ngủ đều nhé!"
                        : "Your focus stays resilient across sleep variations — keep protecting a consistent bedtime!"}
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
