"use client";

import { CalendarClock, Layers, Wand2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

type PlannerTabKey = "timeline" | "templates" | "tools";

export function PlannerTabsShell({
  timelinePanel,
  templatesPanel,
  toolsPanel,
}: {
  timelinePanel: ReactNode;
  templatesPanel: ReactNode;
  toolsPanel: ReactNode;
}) {
  const isVi = useLocale() === "vi";
  const [tab, setTab] = useState<PlannerTabKey>("timeline");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "1") setTab("timeline");
      else if (e.key === "2") setTab("templates");
      else if (e.key === "3") setTab("tools");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tabs: Array<{ key: PlannerTabKey; label: string; icon: typeof CalendarClock }> = [
    {
      key: "timeline",
      label: isVi ? "Trục thời gian & Mục tiêu" : "Timeline & Goals",
      icon: CalendarClock,
    },
    {
      key: "templates",
      label: isVi ? "Mẫu & Lặp lại" : "Templates & Recurring",
      icon: Layers,
    },
    {
      key: "tools",
      label: isVi ? "Chia nhỏ & Chuyển việc" : "Breakdown & Rollover",
      icon: Wand2,
    },
  ];

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={isVi ? "Công cụ lập kế hoạch" : "Planner tools"}
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
      </div>

      <div key={tab} className="fg-animate-panel">
        {tab === "timeline" && timelinePanel}
        {tab === "templates" && templatesPanel}
        {tab === "tools" && toolsPanel}
      </div>
    </section>
  );
}
