"use client";

import { CornerDownLeft, Loader2, Plus, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";
import { createTaskAction } from "@/lib/actions/tasks";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
import { useLocale } from "@/components/i18n/language-provider";
import { useToast } from "@/components/ui/toast";

function parseQuickTask(raw: string): {
  title: string;
  kind: "must_do" | "should_do" | "bonus";
  estimatedMinutes: number;
  requiredFocusMinutes: number;
} {
  let text = raw.trim();
  let kind: "must_do" | "should_do" | "bonus" = "should_do";

  if (/(^|\s)(!must|!)/i.test(text)) {
    kind = "must_do";
    text = text.replace(/(^|\s)(!must|!)(?=\s|$)/gi, " ").trim();
  } else if (/(^|\s)(\*bonus|\*)/i.test(text)) {
    kind = "bonus";
    text = text.replace(/(^|\s)(\*bonus|\*)(?=\s|$)/gi, " ").trim();
  }

  let estimatedMinutes = 25;
  const durMatch = text.match(/(?:^|\s)(\d{1,3})\s?(m|min|p|phút)(?=\s|$)/i);
  if (durMatch) {
    const val = Number.parseInt(durMatch[1] ?? "25", 10);
    if (Number.isFinite(val) && val >= 5 && val <= 480) {
      estimatedMinutes = val;
      text = text.replace(durMatch[0], " ").trim();
    }
  }

  const requiredFocusMinutes = Math.min(estimatedMinutes, Math.max(0, estimatedMinutes >= 20 ? 20 : estimatedMinutes));
  return {
    title: text.replace(/\s+/g, " ").trim(),
    kind,
    estimatedMinutes,
    requiredFocusMinutes,
  };
}

export function QuickAddTaskBar() {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();

  const parsed = input.trim().length > 0 ? parseQuickTask(input) : null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!parsed || !parsed.title || pending) return;
    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", parsed.title);
      fd.set("description", "");
      fd.set("category", "work");
      fd.set("kind", parsed.kind);
      fd.set("priority", parsed.kind === "must_do" ? "high" : "medium");
      fd.set("estimatedMinutes", String(parsed.estimatedMinutes));
      fd.set("requiredFocusMinutes", String(parsed.requiredFocusMinutes));
      fd.set("dueDate", "");
      const res = await createTaskAction(EMPTY_ACTION_STATE, fd);
      if (res.error) {
        toast.push("error", res.error);
      } else {
        setInput("");
        toast.push(
          "success",
          isVi ? `Đã thêm "${parsed.title}" (${parsed.estimatedMinutes}p).` : `Added "${parsed.title}" (${parsed.estimatedMinutes}m).`,
        );
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-2xl border border-line bg-surface p-2.5 shadow-sm transition-colors focus-within:border-accent/50"
    >
      <div className="flex items-center gap-2.5 px-1.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
        </span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          placeholder={
            isVi
              ? 'Thêm nhanh nhiệm vụ… (VD: "Đọc sách 30m !must" rồi nhấn Enter)'
              : 'Quick-add task… (e.g. "Read book 30m !must" and press Enter)'
          }
          className="h-9 flex-1 bg-transparent text-[13.5px] text-ink placeholder:text-muted/75 focus:outline-none"
        />
        <button
          type="submit"
          disabled={pending || !parsed?.title}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl bg-ink px-3 text-[11.5px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-35"
        >
          <span>{isVi ? "Thêm" : "Add"}</span>
          <CornerDownLeft className="size-3" />
        </button>
      </div>

      {parsed && parsed.title ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/60 px-2 pt-2 text-[11px] text-muted">
          <Sparkles className="size-3 text-accent" />
          <span className="rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink">
            {parsed.kind === "must_do"
              ? isVi
                ? "Bắt buộc"
                : "Must-do"
              : parsed.kind === "bonus"
                ? isVi
                  ? "Thưởng"
                  : "Bonus"
                : isVi
                  ? "Nên làm"
                  : "Should-do"}
          </span>
          <span className="rounded-full bg-surface-2 px-2 py-0.5 tabular-nums text-ink-soft">
            {parsed.estimatedMinutes}m
          </span>
          <span className="text-[10.5px] text-muted">
            {isVi ? "Mẹo: thêm !must, *bonus hoặc 45m" : "Tip: add !must, *bonus, or 45m"}
          </span>
        </div>
      ) : null}
    </form>
  );
}
