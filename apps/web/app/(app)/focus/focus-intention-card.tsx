"use client";

import { Compass, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

export const INTENTION_STORAGE_KEY = "focusgate:current-intention";

export function FocusIntentionCard() {
  const isVi = useLocale() === "vi";
  const [intention, setIntention] = useState("");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(INTENTION_STORAGE_KEY);
      if (saved) setIntention(saved);
    } catch {
      // ignore
    }
  }, []);

  function update(next: string) {
    setIntention(next);
    try {
      window.localStorage.setItem(INTENTION_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-2xl border border-accent/25 bg-accent-soft/35 px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="fg-pre-intention"
          className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-accent"
        >
          <Compass className="size-3.5" />
          {isVi ? "Cam kết ý định trước phiên" : "Pre-session intention"}
        </label>
        {intention.trim() ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-accent">
            <Sparkles className="size-3" />
            {isVi ? "Sẽ ghim dưới đồng hồ" : "Pinned under timer"}
          </span>
        ) : null}
      </div>
      <input
        id="fg-pre-intention"
        type="text"
        maxLength={120}
        value={intention}
        onChange={(e) => update(e.target.value)}
        placeholder={
          isVi
            ? "Sau phiên này, mình sẽ hoàn tất chính xác phần…"
            : "By the end of this block, I will finish…"
        }
        className="mt-2 w-full rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-accent"
      />
    </div>
  );
}
