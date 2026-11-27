"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DayPulseTabsProps {
  locale: "en" | "vi";
  timelineSlot: ReactNode;
  footprintSlot: ReactNode;
  weeklySlot: ReactNode | null;
  energySlot: ReactNode;
}

type PulseTab = "timeline" | "footprint" | "weekly" | "energy";

export function DayPulseTabs({
  locale,
  timelineSlot,
  footprintSlot,
  weeklySlot,
  energySlot,
}: DayPulseTabsProps) {
  const isVi = locale === "vi";
  const [tab, setTab] = useState<PulseTab>("timeline");

  const tabs: Array<{ id: PulseTab; label: string }> = [
    { id: "timeline", label: isVi ? "Nhịp độ hôm nay" : "Day rhythm" },
    { id: "footprint", label: isVi ? "Dấu ấn tập trung" : "Focus footprint" },
    ...(weeklySlot ? [{ id: "weekly" as const, label: isVi ? "7 ngày gần nhất" : "7-day peek" }] : []),
    { id: "energy", label: isVi ? "Chiến thắng & Năng lượng" : "Wins & Energy" },
  ];

  return (
    <section
      data-zen-hide="true"
      className="spotlight-card mt-5 rounded-2xl border border-line bg-surface/90 p-3.5 shadow-card backdrop-blur-sm sm:p-4"
      aria-label={isVi ? "Nhịp độ và bối cảnh hôm nay" : "Today's rhythm and context"}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2.5">
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-surface-2/80 p-1">
          {tabs.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-full px-3 py-1 text-[11.5px] font-medium transition-all",
                  active
                    ? "bg-ink text-canvas shadow-xs"
                    : "text-muted hover:text-ink",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
        <span className="hidden text-[11px] text-muted sm:inline">
          {isVi ? "Gọn 1 chạm · Tập trung tối đa" : "Unified pulse · Less clutter"}
        </span>
      </div>

      <div className="mt-3">
        {tab === "timeline" && timelineSlot}
        {tab === "footprint" && footprintSlot}
        {tab === "weekly" && weeklySlot}
        {tab === "energy" && energySlot}
      </div>
    </section>
  );
}
