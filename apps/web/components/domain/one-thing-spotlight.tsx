"use client";

import Link from "next/link";
import { ArrowRight, Crosshair, Timer, X } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { buttonVariants } from "@/components/ui/button";

export function OneThingSpotlight({
  taskId,
  taskTitle,
  estimatedMinutes,
  kindLabel,
}: {
  taskId: string | null;
  taskTitle: string | null;
  estimatedMinutes?: number;
  kindLabel?: string;
}) {
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);

  if (!taskTitle) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft/70 px-3 py-1.5 text-[12px] font-medium text-accent transition-colors hover:bg-accent hover:text-white"
      >
        <Crosshair className="size-3.5" />
        {isVi ? "Chế độ 1 Việc" : "One Thing Mode"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-canvas/96 p-6 backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label={isVi ? "Chế độ 1 việc duy nhất" : "One Thing Spotlight"}
        >
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="absolute right-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
          >
            <X className="size-3.5" />
            {isVi ? "Thoát chế độ 1 việc" : "Exit Spotlight"}
          </button>

          <div className="fg-animate-in flex max-w-xl flex-col items-center text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-3.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.14em] text-accent">
              <Crosshair className="size-3.5" />
              {kindLabel || (isVi ? "Ưu tiên số 1 ngay lúc này" : "Your #1 Priority Right Now")}
            </span>

            <h2 className="mt-6 font-display text-[36px] leading-tight text-ink sm:text-[46px]">
              {taskTitle}
            </h2>

            {estimatedMinutes ? (
              <p className="mt-3 text-[14px] text-muted">
                {isVi
                  ? `Ước tính ${estimatedMinutes} phút · Tạm quên mọi việc khác cho đến khi xong việc này.`
                  : `Estimated ${estimatedMinutes}m · Ignore everything else until this one thing is done.`}
              </p>
            ) : null}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href={taskId ? `/focus?taskId=${taskId}` : "/focus"}
                onClick={() => setOpen(false)}
                className={buttonVariants({ variant: "accent", size: "lg" })}
              >
                <Timer className="size-4" />
                {isVi ? "Bắt đầu tập trung ngay" : "Start Focusing Now"}
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
