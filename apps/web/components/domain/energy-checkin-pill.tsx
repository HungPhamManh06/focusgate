"use client";

import Link from "next/link";
import { Flame, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

type EnergyLevel = "high" | "medium" | "low";

const HISTORY_KEY = "focusgate:energy-history";

export function EnergyCheckinPill() {
  const isVi = useLocale() === "vi";
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayKey = `focusgate:energy:${todayIso}`;
  const [energy, setEnergy] = useState<EnergyLevel | null>(null);
  const [history, setHistory] = useState<Array<{ date: string; score: number }>>([]);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(todayKey) as EnergyLevel | null;
      if (saved === "high" || saved === "medium" || saved === "low") setEnergy(saved);
      const raw = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]") as Array<{
        date: string;
        score: number;
      }>;
      if (Array.isArray(raw)) setHistory(raw.slice(-7));
    } catch {
      // ignore
    }
  }, [todayKey]);

  function pick(next: EnergyLevel) {
    setEnergy(next);
    const score = next === "high" ? 3 : next === "medium" ? 2 : 1;
    setHistory((prev) => {
      const updated = [...prev.filter((p) => p.date !== todayIso), { date: todayIso, score }].slice(-7);
      try {
        window.localStorage.setItem(todayKey, next);
        window.localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }

  const tip =
    energy === "high"
      ? isVi
        ? "Gợi ý: Đánh thẳng phiên Deep Work 50p cho việc khó nhất."
        : "Tip: Tackle your hardest task with a 50m Deep Work block."
      : energy === "medium"
        ? isVi
          ? "Gợi ý: Nhịp Pomodoro 25p đều đặn sẽ giữ phong độ tốt nhất."
          : "Tip: Steady 25m Pomodoro blocks will keep you moving."
        : energy === "low"
          ? isVi
            ? "Gợi ý: Chia nhỏ thành Sprint 15p để dễ khởi động."
            : "Tip: Start small with a 15m Sprint to build momentum."
          : null;

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface px-4 py-2.5 text-[11.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-muted">
          {isVi ? "Năng lượng hôm nay:" : "Today's energy:"}
        </span>
        {(
          [
            { id: "high", icon: Flame, label: isVi ? "Cao" : "High" },
            { id: "medium", icon: Sun, label: isVi ? "Vừa" : "Steady" },
            { id: "low", icon: Moon, label: isVi ? "Thấp" : "Low" },
          ] as const
        ).map((opt) => {
          const Icon = opt.icon;
          const active = energy === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => pick(opt.id)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-medium transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface-2/60 text-muted hover:text-ink",
              )}
            >
              <Icon className="size-3" />
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        {history.length >= 2 ? (
          <svg
            width="56"
            height="18"
            viewBox="0 0 56 18"
            aria-label={isVi ? "Xu hướng năng lượng 7 ngày" : "7-day energy trend"}
            className="shrink-0"
          >
            <polyline
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={history
                .map((p, idx) => {
                  const x = history.length === 1 ? 28 : 4 + (idx / (history.length - 1)) * 48;
                  const y = 15 - ((p.score - 1) / 2) * 11;
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                })
                .join(" ")}
            />
          </svg>
        ) : null}
        {tip ? (
          <Link href="/focus" className="text-[11px] font-medium text-accent hover:underline">
            {tip}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
