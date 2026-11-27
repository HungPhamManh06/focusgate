"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

type ActiveSessionPayload = {
  id: string;
  status: string;
  mode?: string;
  startedAt: string;
  pausedAt?: string | null;
  pausedSeconds?: number;
  taskTitle?: string | null;
  plannedMinutes: number;
};

function computeElapsedSeconds(session: ActiveSessionPayload): number {
  const startedMs = new Date(session.startedAt).getTime();
  if (!Number.isFinite(startedMs)) return 0;
  const refMs =
    session.status === "paused" && session.pausedAt
      ? new Date(session.pausedAt).getTime()
      : Date.now();
  return Math.max(
    0,
    Math.floor((refMs - startedMs) / 1000) - Math.max(0, session.pausedSeconds ?? 0),
  );
}

export function FocusHeaderRibbon() {
  const isVi = useLocale() === "vi";
  const [session, setSession] = useState<ActiveSessionPayload | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch("/api/agent/focus-session", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          active: boolean;
          session?: ActiveSessionPayload | null;
        };
        if (cancelled) return;
        if (data.active && data.session) {
          setSession(data.session);
          setElapsedSec(computeElapsedSeconds(data.session));
        } else {
          setSession(null);
        }
      } catch {
        // Ignore transient network errors
      }
    };

    void load();
    const poll = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, []);

  useEffect(() => {
    if (!session || session.status === "paused") return;
    const tick = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [session]);

  if (!session) return null;

  const isPaused = session.status === "paused";
  const isOpenEnded = session.mode === "open_ended";
  const totalSec = Math.max(60, session.plannedMinutes * 60);
  const progressPct = isOpenEnded
    ? Math.max(4, Math.min(100, ((elapsedSec % 3600) / 3600) * 100))
    : Math.max(2, Math.min(100, (elapsedSec / totalSec) * 100));

  return (
    <div
      role="progressbar"
      aria-label={
        isPaused
          ? isVi
            ? "Phiên tập trung đang tạm dừng"
            : "Focus session paused"
          : isVi
            ? "Tiến độ phiên tập trung đang chạy"
            : "Active focus session progress"
      }
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progressPct)}
      className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-[2.5px] bg-ink/8"
    >
      <div
        className={cn(
          "h-full transition-[width] duration-700 ease-out",
          isPaused
            ? "bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.55)]"
            : "bg-gradient-to-r from-accent via-accent to-rose-400 shadow-[0_0_10px_var(--accent)]",
        )}
        style={{ width: `${progressPct.toFixed(2)}%` }}
      />
    </div>
  );
}
