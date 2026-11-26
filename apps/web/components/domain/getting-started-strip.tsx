"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Compass, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

const DISMISS_KEY = "focusgate:getting-started-dismissed";

export function GettingStartedStrip({
  hasTasks,
  hasSessions,
  hasPlan,
}: {
  hasTasks: boolean;
  hasSessions: boolean;
  hasPlan: boolean;
}) {
  const isVi = useLocale() === "vi";
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  if (dismissed || (hasTasks && hasSessions && hasPlan)) return null;

  const steps = [
    { done: hasTasks, href: "/tasks", label: isVi ? "1. Thêm việc Bắt buộc" : "1. Add a Must-Do" },
    { done: hasPlan, href: "/planner", label: isVi ? "2. Chốt kế hoạch ngày" : "2. Lock today's plan" },
    { done: hasSessions, href: "/focus", label: isVi ? "3. Chạy phiên tập trung" : "3. Complete 1 focus block" },
  ];

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/25 bg-accent-soft/40 px-4 py-3 text-[12px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 font-semibold text-accent">
          <Compass className="size-4" />
          {isVi ? "Bắt đầu nhanh:" : "Quick start:"}
        </span>
        {steps.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors ${
              s.done
                ? "border-success/35 bg-success-soft text-success line-through"
                : "border-line bg-surface text-ink hover:border-accent/40 hover:text-accent"
            }`}
          >
            {s.done ? <CheckCircle2 className="size-3.5" /> : <Circle className="size-3.5 text-muted" />}
            {s.label}
          </Link>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(DISMISS_KEY, "1");
          } catch {
            // ignore
          }
        }}
        aria-label="Dismiss quick start"
        className="rounded-full p-1 text-muted hover:bg-surface hover:text-ink"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
