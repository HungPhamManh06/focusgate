"use client";

import Link from "next/link";
import { ArrowRight, Sparkles, Sunrise } from "lucide-react";
import { useTransition } from "react";
import { createPlanAction, populateTodayHabitsAction } from "@/lib/actions/planner";
import type { Task } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

export function MorningRitualBanner({
  suggestedTasks,
}: {
  suggestedTasks: Task[];
}) {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function kickoffToday() {
    startTransition(async () => {
      const created = await createPlanAction();
      if (created.error) {
        toast.push("error", created.error);
        return;
      }
      const populated = await populateTodayHabitsAction();
      if (populated.error) {
        toast.push("success", isVi ? "Đã tạo kế hoạch hôm nay." : "Today's plan created.");
      } else {
        toast.push(
          "success",
          isVi
            ? "Đã khởi động kế hoạch hôm nay và nạp thói quen hằng ngày!"
            : "Today's plan started with your daily habits!",
        );
      }
    });
  }

  return (
    <section className="mt-5 overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent-soft/75 via-surface to-surface-2 p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-0.5 text-[11px] font-semibold text-accent shadow-sm">
            <Sunrise className="size-3.5" />
            {isVi ? "Khởi động ngày mới · Morning Ritual" : "Morning Ritual · Daily Kickoff"}
          </span>
          <h2 className="mt-2.5 font-display text-[24px] leading-snug text-ink sm:text-[26px]">
            {isVi
              ? "Chốt 3 việc quan trọng nhất trước khi mở màn hình."
              : "Lock in your top priorities before the noise begins."}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            {isVi
              ? "Một bấm để tạo Kế hoạch hôm nay, tự động nạp toàn bộ Thói quen hằng ngày và kích hoạt Cổng kỷ luật."
              : "One click creates today's plan, auto-populates your daily habits, and arms your FocusGate."}
          </p>

          {suggestedTasks.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestedTasks.slice(0, 3).map((task) => (
                <span
                  key={task.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-2.5 py-1 text-[11.5px] text-ink-soft"
                >
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                  <span className="max-w-[180px] truncate">{task.title}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="accent"
            size="md"
            disabled={pending}
            onClick={kickoffToday}
          >
            <Sparkles className="size-4" />
            {pending
              ? isVi
                ? "Đang khởi động…"
                : "Starting…"
              : isVi
                ? "Khởi động ngày mới"
                : "Kick off today"}
          </Button>
          <Link
            href="/planner"
            className={buttonVariants({ variant: "outline", size: "md" })}
          >
            {isVi ? "Tùy chỉnh chi tiết" : "Customize"} <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  );
}
