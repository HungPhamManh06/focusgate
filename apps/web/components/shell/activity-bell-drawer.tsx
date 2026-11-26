"use client";

import { Bell, CheckCircle2, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

type DebriefItem = {
  sessionId: string;
  quality: "deep" | "steady" | "distracted";
  minutes: number;
};

export function ActivityBellDrawer({ collapsed = false }: { collapsed?: boolean }) {
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<DebriefItem[]>([]);

  useEffect(() => {
    if (!open) return;
    try {
      const todayKey = `focusgate:debrief-log:${new Date().toISOString().slice(0, 10)}`;
      const saved = JSON.parse(window.localStorage.getItem(todayKey) || "[]") as DebriefItem[];
      if (Array.isArray(saved)) setLogs([...saved].reverse());
    } catch {
      // ignore
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={isVi ? "Nhật ký hoạt động hôm nay" : "Today's activity"}
        aria-label={isVi ? "Nhật ký hoạt động hôm nay" : "Today's activity"}
        className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <Bell className="size-4" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="fg-animate-in flex h-full w-full max-w-sm flex-col border-l border-line bg-surface shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-accent" />
                <h2 className="text-[14.5px] font-semibold text-ink">
                  {isVi ? "Nhật ký Tập trung Hôm nay" : "Today's Activity"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
              {logs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-line bg-surface-2/50 p-5 text-center">
                  <Sparkles className="mx-auto size-5 text-accent" />
                  <p className="mt-2 text-[12.5px] font-medium text-ink">
                    {isVi ? "Chưa có phiên nào được tổng kết hôm nay" : "No debriefed sessions yet today"}
                  </p>
                  <p className="mt-1 text-[11.5px] text-muted">
                    {isVi
                      ? "Các phiên tập trung hoàn thành và cảm nhận tập trung của bạn sẽ xuất hiện tại đây."
                      : "Completed focus sessions and your depth check-ins will appear here."}
                  </p>
                </div>
              ) : (
                logs.map((item, idx) => (
                  <div
                    key={`${item.sessionId}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/55 px-3.5 py-2.5 text-[12.5px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2 className="size-4 shrink-0 text-success" />
                      <div>
                        <p className="font-medium text-ink">
                          {isVi ? `Hoàn thành phiên ${item.minutes} phút` : `Completed ${item.minutes}m focus`}
                        </p>
                        <p className="text-[11px] text-muted">
                          {item.quality === "deep"
                            ? isVi
                              ? "🔥 Tập trung sâu"
                              : "🔥 Deep focus"
                            : item.quality === "steady"
                              ? isVi
                                ? "👍 Ổn định"
                                : "👍 Steady"
                              : isVi
                                ? "😵‍💫 Hơi xao nhãng"
                                : "😵‍💫 Distracted"}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {collapsed ? null : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
