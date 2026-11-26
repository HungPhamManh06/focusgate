"use client";

import { ChevronLeft, ChevronRight, Pin, Quote } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

const MOTTO_KEY = "focusgate:personal-motto";

const QUOTES_EN = [
  "Discipline is choosing between what you want now and what you want most.",
  "One finished deep block beats ten half-started intentions.",
  "Guard your attention like your most scarce resource.",
  "Earn your leisure first; enjoy it with a quiet mind.",
];

const QUOTES_VI = [
  "Kỷ luật là chọn điều bạn thực sự muốn thay vì điều bạn nhất thời thèm.",
  "Một phiên tập trung trọn vẹn giá trị hơn mười dự định dang dở.",
  "Bảo vệ sự chú ý như tài sản quý giá nhất của ngày hôm nay.",
  "Hoàn thành việc quan trọng trước, tận hưởng tự do với tâm trí nhẹ nhàng.",
];

export function MottoCarouselStrip() {
  const isVi = useLocale() === "vi";
  const list = isVi ? QUOTES_VI : QUOTES_EN;
  const [idx, setIdx] = useState(0);
  const [customMotto, setCustomMotto] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(MOTTO_KEY);
      if (saved) setCustomMotto(saved);
    } catch {
      // ignore
    }
  }, []);

  function saveMotto(val: string) {
    const clean = val.trim();
    setCustomMotto(clean);
    setEditing(false);
    try {
      if (clean) window.localStorage.setItem(MOTTO_KEY, clean);
      else window.localStorage.removeItem(MOTTO_KEY);
    } catch {
      // ignore
    }
  }

  return (
    <div
      data-hide-compact="true"
      className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/90 px-4 py-2.5 text-[12px]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Quote className="size-3.5 shrink-0 text-accent" />
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMotto(customMotto);
            }}
            className="flex flex-1 items-center gap-2"
          >
            <input
              type="text"
              maxLength={120}
              value={customMotto}
              onChange={(e) => setCustomMotto(e.target.value)}
              placeholder={isVi ? "Nhập câu châm ngôn cá nhân…" : "Pin your personal motto…"}
              className="w-full rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[12px] text-ink outline-none focus:border-accent"
              autoFocus
            />
            <button
              type="submit"
              className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white"
            >
              {isVi ? "Ghim" : "Pin"}
            </button>
          </form>
        ) : (
          <p className="truncate italic text-ink-soft">
            “{customMotto || list[idx % list.length]}”
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {!customMotto && !editing ? (
          <>
            <button
              type="button"
              aria-label="Previous quote"
              onClick={() => setIdx((i) => (i - 1 + list.length) % list.length)}
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Next quote"
              onClick={() => setIdx((i) => (i + 1) % list.length)}
              className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          title={isVi ? "Ghim châm ngôn cá nhân" : "Pin personal motto"}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10.5px] font-medium text-muted hover:text-ink"
        >
          <Pin className="size-3 text-accent" />
          {customMotto ? (isVi ? "Sửa" : "Edit") : isVi ? "Ghim câu riêng" : "Pin motto"}
        </button>
      </div>
    </div>
  );
}
