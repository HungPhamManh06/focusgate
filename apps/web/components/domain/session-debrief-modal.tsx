"use client";

import Link from "next/link";
import { CheckCircle2, Flame, Sparkles, Timer, Volume2, VolumeX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import {
  CelebrationBurst,
  CHIME_MUTED_KEY,
  playZenChime,
} from "@/components/domain/celebration-fx";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const DEBRIEF_STORAGE_KEY = "focusgate:last-completed-session";

export type DebriefPayload = {
  sessionId: string;
  taskTitle: string | null;
  minutes: number;
  completedAt: number;
};

type FocusQuality = "deep" | "steady" | "distracted";

export function SessionDebriefModal() {
  const isVi = useLocale() === "vi";
  const [payload, setPayload] = useState<DebriefPayload | null>(null);
  const [quality, setQuality] = useState<FocusQuality | null>(null);
  const [chimeMuted, setChimeMuted] = useState(false);

  useEffect(() => {
    try {
      setChimeMuted(window.localStorage.getItem(CHIME_MUTED_KEY) === "1");
      const raw = window.sessionStorage.getItem(DEBRIEF_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DebriefPayload;
      if (parsed && Date.now() - parsed.completedAt < 120_000) {
        setPayload(parsed);
        playZenChime();
      }
      window.sessionStorage.removeItem(DEBRIEF_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  function toggleMute() {
    setChimeMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(CHIME_MUTED_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  if (!payload) return null;

  const estimatedReward = Math.max(5, Math.round(payload.minutes * 0.4));

  function pickQuality(next: FocusQuality) {
    setQuality(next);
    try {
      const todayKey = `focusgate:debrief-log:${new Date().toISOString().slice(0, 10)}`;
      const existing = JSON.parse(window.localStorage.getItem(todayKey) || "[]") as Array<{
        sessionId: string;
        quality: FocusQuality;
        minutes: number;
      }>;
      existing.push({ sessionId: payload!.sessionId, quality: next, minutes: payload!.minutes });
      window.localStorage.setItem(todayKey, JSON.stringify(existing.slice(-20)));
    } catch {
      // Ignore storage errors
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={isVi ? "Tổng kết phiên tập trung" : "Focus session debrief"}
    >
      <CelebrationBurst />
      <div className="fg-animate-in relative w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
        <div className="bg-gradient-to-br from-accent/15 via-surface to-success/10 px-6 pb-5 pt-6">
          <div className="absolute right-4 top-4 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMute}
              title={chimeMuted ? (isVi ? "Bật chuông" : "Unmute chime") : isVi ? "Tắt chuông" : "Mute chime"}
              aria-label={chimeMuted ? "Unmute chime" : "Mute chime"}
              className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              {chimeMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setPayload(null)}
              aria-label={isVi ? "Đóng" : "Close"}
              className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[11px] font-semibold text-success">
            <CheckCircle2 className="size-3.5" />
            {isVi ? "Phiên tập trung hợp lệ" : "Verified focus block"}
          </div>

          <h2 className="mt-3 font-display text-[28px] leading-tight text-ink">
            {isVi ? "Xuất sắc! Bạn vừa giữ vững kỷ luật." : "Locked in. Great session."}
          </h2>
          {payload.taskTitle ? (
            <p className="mt-1 text-[13px] text-muted">{payload.taskTitle}</p>
          ) : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-line bg-surface/90 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <Timer className="size-3.5 text-accent" />
                {isVi ? "Thời lượng" : "Duration"}
              </p>
              <p className="mt-1 font-display text-[26px] tabular-nums leading-none text-ink">
                {payload.minutes}m
              </p>
            </div>
            <div className="rounded-2xl border border-line bg-surface/90 p-3.5">
              <p className="flex items-center gap-1.5 text-[11px] text-muted">
                <Sparkles className="size-3.5 text-success" />
                {isVi ? "Tích lũy ví thưởng" : "Earned reward"}
              </p>
              <p className="mt-1 font-display text-[26px] tabular-nums leading-none text-success">
                +{estimatedReward}m
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          <p className="text-[12px] font-medium text-ink">
            {isVi ? "Mức độ tập trung của bạn thế nào?" : "How was your focus depth?"}
          </p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {(
              [
                { id: "deep", emoji: "🔥", label: isVi ? "Sâu" : "Deep" },
                { id: "steady", emoji: "👍", label: isVi ? "Ổn định" : "Steady" },
                { id: "distracted", emoji: "😵‍💫", label: isVi ? "Xao nhãng" : "Distracted" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => pickQuality(opt.id)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[12px] font-medium transition-all",
                  quality === opt.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface-2/60 text-ink-soft hover:border-accent/40",
                )}
              >
                <span className="text-[18px]">{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between gap-2">
            <Link
              href="/"
              onClick={() => setPayload(null)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {isVi ? "Về Tổng quan" : "Dashboard"}
            </Link>
            <Button type="button" variant="accent" size="sm" onClick={() => setPayload(null)}>
              <Flame className="size-3.5" />
              {isVi ? "Tiếp tục phiên mới" : "Ready for next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
