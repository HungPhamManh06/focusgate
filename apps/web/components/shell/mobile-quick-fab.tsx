"use client";

import { CornerDownLeft, Loader2, Plus, X } from "lucide-react";
import { useState, useTransition } from "react";
import { createTaskAction } from "@/lib/actions/tasks";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
import { useLocale } from "@/components/i18n/language-provider";
import { useToast } from "@/components/ui/toast";

export function MobileQuickFab() {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"must_do" | "should_do" | "bonus">("must_do");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const clean = title.trim();
    if (!clean || pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", clean);
      fd.set("description", "");
      fd.set("category", "work");
      fd.set("kind", kind);
      fd.set("priority", kind === "must_do" ? "high" : "medium");
      fd.set("estimatedMinutes", "25");
      fd.set("requiredFocusMinutes", "20");
      fd.set("dueDate", "");
      const res = await createTaskAction(EMPTY_ACTION_STATE, fd);
      if (res.error) {
        toast.push("error", res.error);
      } else {
        setTitle("");
        setOpen(false);
        toast.push("success", isVi ? `Đã thêm "${clean}"` : `Added "${clean}"`);
      }
    });
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isVi ? "Thêm nhanh nhiệm vụ" : "Quick add task"}
        className="fixed bottom-20 left-4 z-40 flex size-12 items-center justify-center rounded-full bg-accent text-white shadow-lift transition-transform active:scale-95"
      >
        <Plus className="size-5" strokeWidth={2.4} />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 p-3 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            className="fg-animate-in w-full rounded-3xl border border-line bg-surface p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13.5px] font-semibold text-ink">
                {isVi ? "Thêm nhanh nhiệm vụ" : "Quick capture task"}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isVi ? "Bạn cần hoàn thành việc gì?" : "What needs to get done?"}
              className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink focus:border-accent focus:outline-none"
            />
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="flex gap-1">
                {(
                  [
                    { id: "must_do", label: isVi ? "Bắt buộc" : "Must" },
                    { id: "should_do", label: isVi ? "Nên làm" : "Should" },
                    { id: "bonus", label: isVi ? "Thưởng" : "Bonus" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setKind(opt.id)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      kind === opt.id
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-surface text-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={pending || !title.trim()}
                className="inline-flex items-center gap-1 rounded-full bg-accent px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-45"
              >
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CornerDownLeft className="size-3.5" />}
                {isVi ? "Lưu" : "Save"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
