"use client";

import { Sparkles, Unlock } from "lucide-react";
import { useEffect } from "react";
import { useLocale } from "@/components/i18n/language-provider";

const SPARKS = [
  { x: "-72px", y: "-46px", color: "#34d399", delay: "0ms" },
  { x: "-48px", y: "-68px", color: "#fbbf24", delay: "40ms" },
  { x: "-14px", y: "-74px", color: "#34d399", delay: "70ms" },
  { x: "22px", y: "-72px", color: "#fbbf24", delay: "20ms" },
  { x: "56px", y: "-56px", color: "#34d399", delay: "60ms" },
  { x: "78px", y: "-26px", color: "#fbbf24", delay: "90ms" },
  { x: "-80px", y: "-8px", color: "#fbbf24", delay: "50ms" },
  { x: "74px", y: "12px", color: "#34d399", delay: "30ms" },
];

export function GateUnlockCelebration({
  visible,
  onDone,
}: {
  visible: boolean;
  onDone: () => void;
}) {
  const isVi = useLocale() === "vi";

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(t);
  }, [visible, onDone]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4"
    >
      <div className="fg-animate-panel relative flex items-center gap-3 rounded-full border border-success/45 bg-surface/95 px-5 py-3 shadow-2xl backdrop-blur-md">
        {SPARKS.map((s, idx) => (
          <span
            key={idx}
            aria-hidden
            className="fg-animate-check pointer-events-none absolute left-1/2 top-1/2 size-2 rounded-full"
            style={{
              backgroundColor: s.color,
              transform: `translate(${s.x}, ${s.y})`,
              animationDelay: s.delay,
            }}
          />
        ))}
        <span className="flex size-8 items-center justify-center rounded-full bg-success text-white shadow-sm">
          <Unlock className="size-4" />
        </span>
        <div>
          <p className="flex items-center gap-1 text-[13px] font-bold text-ink">
            <Sparkles className="size-3.5 text-success" />
            {isVi ? "Cổng đã mở khóa!" : "Gate Unlocked!"}
          </p>
          <p className="text-[11.5px] text-muted">
            {isVi
              ? "Tất cả việc hôm nay đã xong — tận hưởng tự do không tội lỗi."
              : "All planned tasks complete — enjoy your earned freedom."}
          </p>
        </div>
      </div>
    </div>
  );
}
