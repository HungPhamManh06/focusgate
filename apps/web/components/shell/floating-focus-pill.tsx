"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Check,
  Pause,
  PictureInPicture2,
  Play,
  Timer,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { DEBRIEF_STORAGE_KEY } from "@/components/domain/session-debrief-modal";
import { useToast } from "@/components/ui/toast";
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
  remainingSeconds?: number;
};

type DocumentPiPWindow = Window & {
  documentPictureInPicture?: {
    requestWindow: (opts: { width: number; height: number }) => Promise<Window>;
  };
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

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function FloatingFocusPill() {
  const pathname = usePathname();
  const router = useRouter();
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [session, setSession] = useState<ActiveSessionPayload | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [pipSupported, setPipSupported] = useState(false);
  const [busyAction, setBusyAction] = useState<"pause" | "complete" | null>(null);

  useEffect(() => {
    setPipSupported(
      typeof window !== "undefined" &&
        Boolean((window as DocumentPiPWindow).documentPictureInPicture),
    );
  }, []);

  useEffect(() => {
    if (pathname === "/focus") return;
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
  }, [pathname]);

  useEffect(() => {
    if (!session || session.status === "paused") return;
    const tick = window.setInterval(() => {
      setElapsedSec((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(tick);
  }, [session]);

  if (pathname === "/focus" || !session) return null;

  const isPaused = session.status === "paused";
  const isOpenEnded = session.mode === "open_ended";
  const totalSec = Math.max(60, session.plannedMinutes * 60);
  const progress = isOpenEnded
    ? Math.max(0.05, Math.min(1, (elapsedSec % 3600) / 3600))
    : Math.max(0, Math.min(1, elapsedSec / totalSec));
  const radius = 11;
  const circ = 2 * Math.PI * radius;

  async function togglePause() {
    if (!session || busyAction) return;
    const nextAction = isPaused ? "resume" : "pause";
    setBusyAction("pause");
    const prev = session;
    setSession({
      ...session,
      status: isPaused ? "running" : "paused",
      pausedAt: isPaused ? null : new Date().toISOString(),
    });
    try {
      const res = await fetch("/api/agent/focus-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: nextAction, sessionId: session.id }),
      });
      if (!res.ok) {
        setSession(prev);
        toast.push("error", isVi ? "Không thể cập nhật phiên." : "Could not update session.");
      }
    } catch {
      setSession(prev);
    } finally {
      setBusyAction(null);
    }
  }

  async function quickComplete() {
    if (!session || busyAction) return;
    setBusyAction("complete");
    try {
      const res = await fetch("/api/agent/focus-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", sessionId: session.id }),
      });
      if (!res.ok) {
        toast.push("error", isVi ? "Không thể hoàn thành phiên." : "Could not complete session.");
        return;
      }
      try {
        window.sessionStorage.setItem(
          DEBRIEF_STORAGE_KEY,
          JSON.stringify({
            sessionId: session.id,
            taskTitle: session.taskTitle ?? null,
            minutes: Math.max(1, Math.round(elapsedSec / 60)),
            completedAt: Date.now(),
          }),
        );
      } catch {
        // Ignore storage errors
      }
      setSession(null);
      toast.push("success", isVi ? "Đã hoàn thành phiên tập trung." : "Focus session completed.");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function openPictureInPicture() {
    const pip = (window as DocumentPiPWindow).documentPictureInPicture;
    if (!pip || !session) return;
    try {
      const pipWin = await pip.requestWindow({ width: 280, height: 112 });
      const doc = pipWin.document;
      doc.body.style.margin = "0";
      doc.body.style.background = "#181113";
      doc.body.style.color = "#f5eeee";
      doc.body.style.fontFamily = "system-ui, -apple-system, sans-serif";
      doc.body.style.display = "flex";
      doc.body.style.flexDirection = "column";
      doc.body.style.justifyContent = "center";
      doc.body.style.alignItems = "center";
      doc.body.style.height = "100vh";

      const titleEl = doc.createElement("div");
      titleEl.textContent = session.taskTitle || (isVi ? "Đang tập trung" : "Focusing");
      titleEl.style.fontSize = "12px";
      titleEl.style.opacity = "0.75";
      titleEl.style.marginBottom = "4px";
      titleEl.style.maxWidth = "240px";
      titleEl.style.overflow = "hidden";
      titleEl.style.textOverflow = "ellipsis";
      titleEl.style.whiteSpace = "nowrap";

      const clockEl = doc.createElement("div");
      clockEl.style.fontSize = "38px";
      clockEl.style.fontWeight = "700";
      clockEl.style.fontVariantNumeric = "tabular-nums";
      let localSec = elapsedSec;
      clockEl.textContent = formatClock(localSec);

      doc.body.appendChild(titleEl);
      doc.body.appendChild(clockEl);

      const timer = pipWin.setInterval(() => {
        if (!isPaused) {
          localSec += 1;
          clockEl.textContent = formatClock(localSec);
        }
      }, 1000);
      pipWin.addEventListener("pagehide", () => pipWin.clearInterval(timer));
    } catch {
      // User dismissed or browser blocked PiP
    }
  }

  return (
    <div className="fixed bottom-20 right-4 z-40 lg:bottom-5 lg:right-5">
      <div className="fg-animate-in flex items-center gap-2 rounded-full border border-line bg-surface/94 py-2 pl-3 pr-2.5 shadow-lift backdrop-blur-xl">
        <div className="relative flex size-7 shrink-0 items-center justify-center">
          <svg className="size-7 -rotate-90" viewBox="0 0 28 28" aria-hidden>
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke="var(--line)"
              strokeWidth="2.5"
            />
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke={isPaused ? "#d97706" : "var(--accent)"}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - progress)}
            />
          </svg>
          <Timer className="absolute size-3 text-accent" />
        </div>

        <Link href="/focus" className="min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isPaused ? "bg-warning" : "animate-pulse bg-success",
              )}
            />
            <span className="font-mono text-[13.5px] font-semibold tabular-nums text-ink">
              {formatClock(elapsedSec)}
            </span>
          </div>
          <p className="max-w-[130px] truncate text-[10.5px] text-muted">
            {session.taskTitle || (isVi ? "Đang tập trung" : "Active focus")}
          </p>
        </Link>

        <button
          type="button"
          onClick={togglePause}
          disabled={busyAction !== null}
          title={isPaused ? (isVi ? "Tiếp tục" : "Resume") : isVi ? "Tạm dừng" : "Pause"}
          aria-label={isPaused ? (isVi ? "Tiếp tục" : "Resume") : isVi ? "Tạm dừng" : "Pause"}
          className="flex size-7 items-center justify-center rounded-full border border-line bg-surface-2 text-ink-soft transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-50"
        >
          {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
        </button>

        <button
          type="button"
          onClick={quickComplete}
          disabled={busyAction !== null}
          title={isVi ? "Hoàn thành phiên" : "Complete session"}
          aria-label={isVi ? "Hoàn thành phiên" : "Complete session"}
          className="flex size-7 items-center justify-center rounded-full border border-success/35 bg-success-soft text-success transition-colors hover:bg-success hover:text-white disabled:opacity-50"
        >
          <Check className="size-3.5" strokeWidth={2.6} />
        </button>

        {pipSupported ? (
          <button
            type="button"
            onClick={openPictureInPicture}
            title={isVi ? "Mở cửa sổ nổi (PiP)" : "Open Picture-in-Picture"}
            aria-label={isVi ? "Mở cửa sổ nổi" : "Open Picture-in-Picture"}
            className="flex size-7 items-center justify-center rounded-full border border-line bg-surface-2 text-muted transition-colors hover:border-accent/40 hover:text-accent"
          >
            <PictureInPicture2 className="size-3.5" />
          </button>
        ) : null}

        <Link
          href="/focus"
          aria-label={isVi ? "Mở phòng tập trung" : "Open Focus Studio"}
          className="flex size-7 items-center justify-center rounded-full bg-accent text-white transition-transform hover:scale-105"
        >
          <ArrowUpRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
