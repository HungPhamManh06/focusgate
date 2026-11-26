"use client";

import { Award, Check, MoonStar, Sparkles, X } from "lucide-react";
import { useState, useTransition } from "react";
import { completeTaskAction } from "@/lib/actions/tasks";
import { formatMinutes } from "@/lib/data/format";
import type { PlanTask } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function EveningWrapupTrigger({
  focusMinutes,
  completedCount,
  earnedMinutes,
  remainingTasks,
}: {
  focusMinutes: number;
  completedCount: number;
  earnedMinutes: number;
  remainingTasks: PlanTask[];
}) {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sealed, setSealed] = useState(false);
  const [pending, startTransition] = useTransition();

  function finishTask(taskId: string) {
    startTransition(async () => {
      const res = await completeTaskAction(taskId);
      if (res.error) toast.push("error", res.error);
      else toast.push("success", isVi ? "Đã đánh dấu xong!" : "Marked done!");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] font-medium text-ink-soft transition-colors hover:border-accent/40 hover:text-accent"
      >
        <MoonStar className="size-3.5 text-accent" />
        {isVi ? "Tổng kết ngày" : "Evening wrap-up"}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={isVi ? "Tổng kết cuối ngày" : "Evening wrap-up"}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="fg-animate-in relative w-full max-w-lg overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl">
            <div className="bg-gradient-to-br from-ink/5 via-surface to-accent-soft/50 px-6 pb-5 pt-6">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="absolute right-4 top-4 flex size-8 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>

              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                <MoonStar className="size-3.5" />
                {isVi ? "Nghi thức cuối ngày · Day in Review" : "Evening Ritual · Day in Review"}
              </span>

              <h2 className="mt-2.5 font-display text-[28px] leading-tight text-ink">
                {isVi ? "Khép lại một ngày kỷ luật." : "Close today with intention."}
              </h2>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-2xl border border-line bg-surface p-3">
                  <p className="text-[10.5px] text-muted">{isVi ? "Tập trung" : "Focus"}</p>
                  <p className="mt-0.5 font-display text-[22px] tabular-nums text-ink">
                    {formatMinutes(focusMinutes)}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-3">
                  <p className="text-[10.5px] text-muted">{isVi ? "Đã xong" : "Completed"}</p>
                  <p className="mt-0.5 font-display text-[22px] tabular-nums text-success">
                    {completedCount}
                  </p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-3">
                  <p className="text-[10.5px] text-muted">{isVi ? "Ví thưởng" : "Wallet"}</p>
                  <p className="mt-0.5 font-display text-[22px] tabular-nums text-accent">
                    {formatMinutes(earnedMinutes)}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-6 py-5">
              {remainingTasks.length > 0 ? (
                <div>
                  <p className="text-[12px] font-semibold text-ink">
                    {isVi
                      ? `Còn ${remainingTasks.length} việc chưa hoàn thành hôm nay:`
                      : `${remainingTasks.length} unfinished tasks today:`}
                  </p>
                  <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                    {remainingTasks.slice(0, 6).map((pt) => (
                      <div
                        key={pt.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12.5px]"
                      >
                        <span className="truncate text-ink">{pt.title}</span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => finishTask(pt.taskId)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-success/40 bg-success-soft px-2.5 py-0.5 text-[11px] font-medium text-success hover:bg-success hover:text-white"
                        >
                          <Check className="size-3" /> {isVi ? "Xong" : "Done"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-success/30 bg-success-soft/50 px-4 py-3 text-[12.5px] text-success">
                  {isVi
                    ? "Bạn đã hoàn thành toàn bộ kế hoạch hôm nay. Hãy nghỉ ngơi thật trọn vẹn!"
                    : "You finished every planned task today. Enjoy your well-earned rest!"}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-line pt-4">
                {sealed ? (
                  <span className="fg-animate-in inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-3 py-1 text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                    <Award className="size-4" />
                    {isVi ? "Đã đóng dấu hoàn tất ngày hôm nay!" : "Today sealed & archived!"}
                  </span>
                ) : (
                  <span className="text-[11.5px] text-muted">
                    {isVi ? "Sẵn sàng kết thúc ngày?" : "Ready to close the ledger?"}
                  </span>
                )}

                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  onClick={() => {
                    if (!sealed) {
                      setSealed(true);
                      toast.push(
                        "success",
                        isVi ? "Đã đóng dấu tổng kết ngày!" : "Evening seal stamped!",
                      );
                    } else {
                      setOpen(false);
                    }
                  }}
                  className={cn(sealed && "bg-success hover:bg-success")}
                >
                  <Sparkles className="size-3.5" />
                  {sealed
                    ? isVi
                      ? "Đóng lại"
                      : "Done"
                    : isVi
                      ? "Đóng dấu kết thúc ngày"
                      : "Stamp day complete"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
