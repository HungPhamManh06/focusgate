"use client";

import { useEffect, useState } from "react";

interface AnimatedMinutesProps {
  minutes: number;
  className?: string;
}

function formatCompactMinutes(total: number): string {
  const safe = Math.max(0, Math.round(total));
  if (safe < 60) return `${safe}m`;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Smooth easeOutCubic numeric counter for Focus minutes (respects reduced motion).
 */
export function AnimatedMinutes({ minutes, className = "" }: AnimatedMinutesProps) {
  const [display, setDisplay] = useState(minutes);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.getAttribute("data-motion") === "reduced";
    if (reduced || minutes <= 0) {
      setDisplay(minutes);
      return;
    }

    const start = performance.now();
    const duration = 460;
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(minutes * eased));
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [minutes]);

  return <span className={className}>{formatCompactMinutes(display)}</span>;
}
