"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Timer } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

const PAGE_TITLES: Record<string, { en: string; vi: string }> = {
  "/": { en: "Dashboard", vi: "Tổng quan" },
  "/tasks": { en: "Tasks", vi: "Nhiệm vụ" },
  "/planner": { en: "Today's Plan", vi: "Kế hoạch hôm nay" },
  "/focus": { en: "Focus Studio", vi: "Phòng Tập trung" },
  "/wallet": { en: "Reward Wallet", vi: "Ví thưởng" },
  "/statistics": { en: "Statistics", vi: "Thống kê" },
  "/devices": { en: "Devices & Rules", vi: "Thiết bị & Chặn" },
  "/settings": { en: "Settings", vi: "Cài đặt" },
};

export function StickyScrollHeader() {
  const pathname = usePathname();
  const isVi = useLocale() === "vi";
  const [visible, setVisible] = useState(false);
  const [scrollPct, setScrollPct] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setVisible(y > 220);
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setScrollPct(docH > 0 ? Math.min(100, Math.round((y / docH) * 100)) : 0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  const entry = PAGE_TITLES[pathname] ?? { en: "FocusGate", vi: "FocusGate" };

  return (
    <div className="fixed left-0 right-0 top-0 z-30 hidden border-b border-line bg-surface/90 backdrop-blur-md lg:left-[var(--sidebar-w,250px)] lg:block">
      <div className="mx-auto flex max-w-[1280px] items-center justify-between px-8 py-2">
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-semibold text-ink">
            {isVi ? entry.vi : entry.en}
          </span>
          <span className="font-mono text-[10.5px] text-muted tabular-nums">{scrollPct}%</span>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/tasks"
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-medium text-ink-soft hover:border-accent/40 hover:text-ink"
          >
            <Plus className="size-3" />
            {isVi ? "Thêm việc" : "Add task"}
          </Link>
          <Link
            href="/focus"
            className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-[11px] font-semibold text-white hover:opacity-95"
          >
            <Timer className="size-3" />
            {isVi ? "Tập trung" : "Focus"}
          </Link>
        </div>
      </div>
      <div className="h-[2px] w-full bg-surface-2">
        <div className="h-full bg-accent transition-all duration-150" style={{ width: `${scrollPct}%` }} />
      </div>
    </div>
  );
}
