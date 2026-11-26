"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "focusgate:dashboard-hidden";

const BLOCKS = [
  { id: "footprint", labelEn: "Focus Footprint Bar", labelVi: "Dấu ấn Tập trung 24h" },
  { id: "ritual", labelEn: "Morning Ritual", labelVi: "Nghi thức Buổi sáng" },
  { id: "wins", labelEn: "Today's Wins Strip", labelVi: "Thành tích Hôm nay" },
  { id: "weekly", labelEn: "Weekly Quick-Peek", labelVi: "Tổng quan 7 ngày" },
  { id: "timeline", labelEn: "Day Timeline Ribbon", labelVi: "Dải Thời gian Ngày" },
] as const;

export function DashboardBentoCustomizer() {
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as string[];
      if (Array.isArray(saved)) {
        setHidden(saved);
        applyHidden(saved);
      }
    } catch {
      // ignore
    }
  }, []);

  function applyHidden(ids: string[]) {
    const set = new Set(ids);
    document.querySelectorAll<HTMLElement>("[data-bento-id]").forEach((el) => {
      const id = el.dataset.bentoId;
      if (!id) return;
      el.style.display = set.has(id) ? "none" : "";
    });
  }

  function toggle(id: string) {
    setHidden((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      applyHidden(next);
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-medium text-muted transition-colors hover:border-accent/40 hover:text-ink"
      >
        <SlidersHorizontal className="size-3.5" />
        {isVi ? "Tùy chỉnh bố cục" : "Customize layout"}
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-40 w-64 rounded-2xl border border-line bg-surface p-3 shadow-lift">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              {isVi ? "Ẩn / Hiện khối" : "Show / Hide widgets"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-0.5 text-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {BLOCKS.map((b) => {
              const visible = !hidden.includes(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => toggle(b.id)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-[12px] hover:bg-surface-2"
                >
                  <span className="text-ink-soft">{isVi ? b.labelVi : b.labelEn}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      visible
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-2 text-muted",
                    )}
                  >
                    {visible ? (isVi ? "Hiện" : "On") : isVi ? "Ẩn" : "Off"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
