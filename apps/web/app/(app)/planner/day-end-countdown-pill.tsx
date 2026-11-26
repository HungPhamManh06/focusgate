"use client";

import { Sunset } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

export function DayEndCountdownPill({ endHour = 22 }: { endHour?: number }) {
  const isVi = useLocale() === "vi";
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    const compute = () => {
      const now = new Date();
      const target = new Date(now);
      target.setHours(endHour, 0, 0, 0);
      const diffMin = Math.floor((target.getTime() - now.getTime()) / 60_000);
      if (diffMin <= 0) {
        setLabel(isVi ? `Đã qua ${endHour}:00 · Giờ nghỉ ngơi` : `Past ${endHour}:00 · Wind-down time`);
      } else {
        const hrs = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        setLabel(
          isVi
            ? `Còn ${hrs}g ${mins}p trước ${endHour}:00`
            : `${hrs}h ${mins}m left before ${endHour}:00`,
        );
      }
    };
    compute();
    const id = window.setInterval(compute, 60_000);
    return () => window.clearInterval(id);
  }, [endHour, isVi]);

  if (!label) return null;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[11.5px] font-medium text-ink-soft tabular-nums">
      <Sunset className="size-3.5 text-accent" />
      {label}
    </span>
  );
}
