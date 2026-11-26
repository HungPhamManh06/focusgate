"use client";

import { Coffee, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function BreakTimerCard() {
  const isVi = useLocale() === "vi";
  const [durationSec, setDurationSec] = useState(5 * 60);
  const [remainingSec, setRemainingSec] = useState(5 * 60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          setRunning(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, "0");
  const ss = String(remainingSec % 60).padStart(2, "0");

  function choose(mins: number) {
    setRunning(false);
    setDurationSec(mins * 60);
    setRemainingSec(mins * 60);
  }

  return (
    <Card className="mt-4 border-success/25 bg-gradient-to-r from-success-soft/45 via-surface to-surface">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-[14px] text-success">
          <Coffee className="size-4" />
          {isVi ? "Đồng hồ Nghỉ giải lao (Pomodoro Break)" : "Pomodoro Break Timer"}
        </CardTitle>
        <div className="flex items-center gap-1">
          {[5, 10, 15].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => choose(m)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                durationSec === m * 60
                  ? "border-success bg-success text-white"
                  : "border-line bg-surface text-muted hover:text-ink"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <p className="font-mono text-[30px] font-bold leading-none tabular-nums text-ink">
            {mm}:{ss}
          </p>
          <p className="mt-1 text-[11.5px] text-muted">
            {isVi
              ? "Nghỉ ngắn thư giãn mắt & uống nước — không ảnh hưởng thống kê tập trung."
              : "Rest your eyes & hydrate — kept separate from verified focus stats."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            {running ? (isVi ? "Tạm dừng" : "Pause") : isVi ? "Bắt đầu nghỉ" : "Start break"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setRunning(false);
              setRemainingSec(durationSec);
            }}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
