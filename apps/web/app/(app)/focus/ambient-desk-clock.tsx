"use client";

import { Clock, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";

const QUOTES_EN = [
  "Protect the first hour and the rest of the day follows.",
  "Depth is a choice made one distraction at a time.",
  "Earn your leisure; enjoy it without guilt.",
  "Clarity comes from finishing what you promised yourself.",
];

const QUOTES_VI = [
  "Bảo vệ giờ đầu tiên, cả ngày sẽ tự đi vào quỹ đạo.",
  "Chiều sâu là lựa chọn được giữ vững trước từng cơn sao nhãng.",
  "Hoàn thành việc trọng tâm trước, tận hưởng tự do trọn vẹn sau.",
  "Sự sáng rõ đến từ việc hoàn tất điều bạn đã cam kết.",
];

export function AmbientDeskClockTrigger() {
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const dayProgress = Math.min(
    100,
    Math.round(((now.getHours() * 60 + now.getMinutes()) / 1440) * 100),
  );
  const dateStr = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  const quoteList = isVi ? QUOTES_VI : QUOTES_EN;
  const quote = quoteList[now.getDate() % quoteList.length];

  return (
    <>
      <Button type="button" variant="outline" size="md" onClick={() => setOpen(true)}>
        <Clock className="size-4" />
        {isVi ? "Đồng hồ để bàn" : "Desk Clock"}
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={isVi ? "Chế độ Đồng hồ Để bàn" : "Ambient Desk Clock"}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-between bg-canvas px-6 py-8 text-ink"
        >
          <div className="flex w-full max-w-4xl items-center justify-between">
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              <Maximize2 className="size-3.5" />
              FOCUSGATE · {isVi ? "ĐỒNG HỒ ĐỂ BÀN" : "AMBIENT DESK CLOCK"}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-ink"
            >
              <X className="size-3.5" />
              {isVi ? "Thoát (Esc)" : "Exit (Esc)"}
            </button>
          </div>

          <div className="flex flex-col items-center text-center">
            <p className="text-[13px] font-medium uppercase tracking-[0.18em] text-muted">
              {dateStr}
            </p>
            <div className="mt-4 flex items-baseline gap-2 font-display leading-none tracking-[-0.04em] tabular-nums">
              <span className="text-[88px] sm:text-[136px]">{hours}:{minutes}</span>
              <span className="text-[28px] text-accent sm:text-[42px]">{seconds}</span>
            </div>
            <p className="mt-6 max-w-lg text-[14px] italic text-ink-soft sm:text-[15px]">
              “{quote}”
            </p>
          </div>

          <div className="w-full max-w-md space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-muted tabular-nums">
              <span>{isVi ? "Tiến độ ngày hôm nay" : "Today's daylight progress"}</span>
              <span>{dayProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-accent transition-all duration-700"
                style={{ width: `${dayProgress}%` }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
