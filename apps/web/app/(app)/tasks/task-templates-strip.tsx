"use client";

import { BookOpen, Code2, Loader2, Sparkles, Sunset, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { useToast } from "@/components/ui/toast";
import { playTaskTickSfx } from "@/lib/domain/gate-sfx";

interface TemplateBundle {
  id: string;
  labelEn: string;
  labelVi: string;
  icon: typeof Zap;
  tasks: Array<{ titleEn: string; titleVi: string; kind: "must_do" | "should_do" | "bonus"; minutes: number }>;
}

const BUNDLES: TemplateBundle[] = [
  {
    id: "deep-work",
    labelEn: "Deep Work Sprint",
    labelVi: "Deep Work Sprint",
    icon: Zap,
    tasks: [
      { titleEn: "Define core deliverable & outline", titleVi: "Xác định đầu việc trọng tâm & dàn ý", kind: "must_do", minutes: 25 },
      { titleEn: "Uninterrupted execution block", titleVi: "Khối tập trung sâu không gián đoạn", kind: "must_do", minutes: 50 },
    ],
  },
  {
    id: "exam-prep",
    labelEn: "3-Step Study Pack",
    labelVi: "Ôn thi 3 bước",
    icon: BookOpen,
    tasks: [
      { titleEn: "Active recall & summary notes", titleVi: "Ôn tập chủ động & tóm tắt ý chính", kind: "must_do", minutes: 30 },
      { titleEn: "Practice exercises & error log", titleVi: "Làm bài tập thực hành & ghi lỗi sai", kind: "must_do", minutes: 45 },
    ],
  },
  {
    id: "dev-review",
    labelEn: "Build & Ship",
    labelVi: "Code & Review",
    icon: Code2,
    tasks: [
      { titleEn: "Implement primary feature slice", titleVi: "Triển khai phần tính năng chính", kind: "must_do", minutes: 45 },
      { titleEn: "Run tests, refactor & self-review", titleVi: "Chạy test, dọn code & tự review", kind: "should_do", minutes: 25 },
    ],
  },
  {
    id: "evening-close",
    labelEn: "Evening Shutdown",
    labelVi: "Dọn việc cuối ngày",
    icon: Sunset,
    tasks: [
      { titleEn: "Clear inbox & reply pending messages", titleVi: "Dọn hộp thư & phản hồi tin nhắn tồn đọng", kind: "should_do", minutes: 15 },
      { titleEn: "Pick top 3 Must-Do tasks for tomorrow", titleVi: "Chọn 3 việc Bắt buộc cho ngày mai", kind: "bonus", minutes: 10 },
    ],
  },
];

export function TaskTemplatesStrip() {
  const isVi = useLocale() === "vi";
  const router = useRouter();
  const toast = useToast();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function applyBundle(bundle: TemplateBundle) {
    if (loadingId) return;
    setLoadingId(bundle.id);
    try {
      for (const item of bundle.tasks) {
        const res = await fetch("/api/agent/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: isVi ? item.titleVi : item.titleEn,
            kind: item.kind,
            requiredFocusMinutes: item.minutes,
            addToTodayPlan: true,
          }),
        });
        if (!res.ok) {
          throw new Error(isVi ? "Không thể tạo gói mẫu tác vụ." : "Failed to apply template bundle.");
        }
      }
      playTaskTickSfx();
      toast.push(
        "success",
        isVi
          ? `Đã thêm ${bundle.tasks.length} việc từ mẫu "${bundle.labelVi}".`
          : `Added ${bundle.tasks.length} tasks from "${bundle.labelEn}".`,
      );
      router.refresh();
    } catch (err) {
      toast.push(
        "error",
        err instanceof Error ? err.message : isVi ? "Có lỗi xảy ra." : "Something went wrong.",
      );
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div
      data-hide-compact="true"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-surface/80 px-3.5 py-2.5"
    >
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        <Sparkles className="size-3.5 text-accent" />
        {isVi ? "Mẫu 1-Click:" : "1-Click Templates:"}
      </span>
      {BUNDLES.map((bundle) => {
        const Icon = bundle.icon;
        const busy = loadingId === bundle.id;
        return (
          <button
            key={bundle.id}
            type="button"
            disabled={loadingId !== null}
            onClick={() => void applyBundle(bundle)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/70 px-3 py-1 text-[11.5px] font-medium text-ink-soft transition-all hover:border-accent/40 hover:bg-accent-soft/50 hover:text-ink active:scale-[0.98] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin text-accent" /> : <Icon className="size-3 text-accent" />}
            {isVi ? bundle.labelVi : bundle.labelEn}
          </button>
        );
      })}
    </div>
  );
}
