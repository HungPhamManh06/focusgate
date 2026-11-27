"use client";

import { useEffect, useState } from "react";

interface AmbientVisualShellProps {
  gateUnlocked: boolean;
}

type DayPeriod = "morning" | "afternoon" | "evening";

function resolveDayPeriod(): DayPeriod {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/**
 * FocusGate 13.0: Dynamic Ambient Mesh Aura (adapts to time-of-day + Gate Unlock state),
 * subtle editorial paper grain, and rAF-throttled cursor spotlight tracking for `.spotlight-card`.
 */
export function AmbientVisualShell({ gateUnlocked }: AmbientVisualShellProps) {
  const [period, setPeriod] = useState<DayPeriod>("afternoon");

  useEffect(() => {
    setPeriod(resolveDayPeriod());
    let rafId = 0;

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      if (rafId) return;
      const target = (event.target as HTMLElement | null)?.closest?.(".spotlight-card") as HTMLElement | null;
      if (!target) return;
      const clientX = event.clientX;
      const clientY = event.clientY;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${Math.round(clientX - rect.left)}px`);
        target.style.setProperty("--my", `${Math.round(clientY - rect.top)}px`);
      });
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const primaryGlow = gateUnlocked
    ? "radial-gradient(620px circle at 24% -6%, rgba(16, 185, 129, 0.14), transparent 65%)"
    : period === "morning"
      ? "radial-gradient(620px circle at 22% -6%, rgba(217, 119, 6, 0.11), transparent 65%)"
      : period === "afternoon"
        ? "radial-gradient(620px circle at 24% -6%, rgba(185, 28, 28, 0.09), transparent 65%)"
        : "radial-gradient(620px circle at 24% -6%, rgba(244, 63, 94, 0.13), transparent 65%)";

  const secondaryGlow =
    "radial-gradient(520px circle at 86% 12%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 68%)";

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ backgroundImage: `${primaryGlow}, ${secondaryGlow}` }}
      />
      <div className="fg-paper-grain absolute inset-0" />
    </div>
  );
}
