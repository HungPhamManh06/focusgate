"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

const ZEN_STORAGE_KEY = "focusgate-zen-view";

export function ZenViewToggle() {
  const isVi = useLocale() === "vi";
  const [zen, setZen] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(ZEN_STORAGE_KEY) === "1";
      setZen(saved);
      document.documentElement.dataset.zenMode = saved ? "true" : "false";
    } catch {
      // Ignore storage access errors
    }
  }, []);

  function toggle() {
    setZen((prev) => {
      const next = !prev;
      document.documentElement.dataset.zenMode = next ? "true" : "false";
      try {
        window.localStorage.setItem(ZEN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Ignore
      }
      return next;
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={zen}
      title={
        zen
          ? isVi
            ? "Tắt chế độ Zen để hiện đầy đủ tiện ích"
            : "Exit Zen view to show all widgets"
          : isVi
            ? "Bật chế độ Zen tối giản — chỉ giữ Cổng & Việc ưu tiên"
            : "Enable Zen view — show only Gate & Next Move"
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] font-medium transition ${
        zen
          ? "border-accent bg-accent text-white shadow-sm"
          : "border-line bg-surface text-ink-soft hover:border-accent/50 hover:text-ink"
      }`}
    >
      <span>{zen ? "✦" : "○"}</span>
      <span>{isVi ? (zen ? "Zen BẬT" : "Zen") : zen ? "Zen ON" : "Zen"}</span>
    </button>
  );
}
