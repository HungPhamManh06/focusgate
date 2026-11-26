"use client";

import { BarChart3, Crown, Flame } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

type StatsTabKey = "overview" | "heatmap" | "quests";

export function StatisticsTabsShell({
  overviewPanel,
  heatmapPanel,
  questsPanel,
}: {
  overviewPanel: ReactNode;
  heatmapPanel: ReactNode;
  questsPanel: ReactNode;
}) {
  const isVi = useLocale() === "vi";
  const [tab, setTab] = useState<StatsTabKey>("overview");

  const tabs: Array<{ key: StatsTabKey; label: string; icon: typeof BarChart3 }> = [
    {
      key: "overview",
      label: isVi ? "Tổng quan & Passport" : "Overview & Passport",
      icon: BarChart3,
    },
    {
      key: "heatmap",
      label: isVi ? "Bản đồ nhiệt & Giấc ngủ" : "Heatmap & Sleep",
      icon: Flame,
    },
    {
      key: "quests",
      label: isVi ? "Cổng Tiến Hóa & Tổng kết tuần" : "Evolving Gate & Review",
      icon: Crown,
    },
  ];

  return (
    <section className="mt-6">
      <div
        role="tablist"
        aria-label={isVi ? "Phân tích thống kê" : "Statistics views"}
        className="inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-surface p-1 shadow-xs"
      >
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.98]",
                active
                  ? "bg-ink text-canvas shadow-xs"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      <div key={tab} className="fg-animate-panel mt-4">
        {tab === "overview" && overviewPanel}
        {tab === "heatmap" && heatmapPanel}
        {tab === "quests" && questsPanel}
      </div>
    </section>
  );
}
