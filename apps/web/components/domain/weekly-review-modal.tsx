"use client";

import { Award, CheckCircle2, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { saveWeeklyReviewAction } from "@/lib/actions/v4";
import type { WeeklyReviewRecord } from "@/lib/data/v4-ecosystem";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function WeeklyReviewCard({
  weekStart,
  latestReview,
  completedThisWeek,
  staleBacklog,
}: {
  weekStart: string;
  latestReview: WeeklyReviewRecord | null;
  completedThisWeek: Array<{ id: string; title: string }>;
  staleBacklog: Array<{ id: string; title: string; daysOpen: number }>;
}) {
  const isVi = useLocale() === "vi";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [proudestWin, setProudestWin] = useState(
    latestReview?.proudestWin || completedThisWeek[0]?.title || "",
  );
  const [reflectionNote, setReflectionNote] = useState(latestReview?.reflectionNote || "");
  const [archiveIds, setArchiveIds] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const toggleArchive = (id: string) => {
    setArchiveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleFinish = () => {
    startTransition(async () => {
      const res = await saveWeeklyReviewAction({
        weekStart,
        proudestWin,
        reflectionNote,
        archiveTaskIds: archiveIds,
      });
      if (res.error) toast.push("error", res.error);
      else {
        toast.push(
          "success",
          isVi ? "Đã hoàn thành Nghi thức Tổng kết Tuần!" : "Weekly Review ritual completed!",
        );
        setStep(1);
      }
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Award className="size-4 text-accent" />
          {isVi ? "Nghi thức Tổng kết Tuần (3 bước)" : "Weekly Review Ritual (3 steps)"}
        </CardTitle>
        <Badge tone={latestReview ? "success" : "neutral"}>
          {latestReview
            ? isVi
              ? "Đã tổng kết tuần này"
              : "Reviewed this week"
            : isVi
              ? `Bước ${step}/3`
              : `Step ${step}/3`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted">
              {isVi
                ? `Tuần này bạn đã hoàn thành ${completedThisWeek.length} nhiệm vụ. Hãy chọn 1 thành quả bạn tự hào nhất:`
                : `You completed ${completedThisWeek.length} task(s) this week. Pick your proudest win:`}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {completedThisWeek.slice(0, 6).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setProudestWin(t.title)}
                  className={`rounded-full border px-3 py-1 text-[11.5px] transition-colors ${
                    proudestWin === t.title
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-surface-2/60 text-ink hover:border-accent/40"
                  }`}
                >
                  {t.title}
                </button>
              ))}
            </div>
            <Input
              value={proudestWin}
              onChange={(e) => setProudestWin(e.target.value)}
              placeholder={isVi ? "Hoặc tự viết chiến thắng tuần này..." : "Or write your proudest win..."}
            />
            <div className="flex justify-end">
              <Button type="button" size="sm" variant="accent" onClick={() => setStep(2)}>
                {isVi ? "Tiếp theo →" : "Next →"}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "Bước 2: Ghi lại 1 điều bạn muốn cải thiện hoặc giữ vững cho tuần tới:"
                : "Step 2: Write 1 thing to keep or improve next week:"}
            </p>
            <textarea
              rows={3}
              value={reflectionNote}
              onChange={(e) => setReflectionNote(e.target.value)}
              placeholder={
                isVi
                  ? "VD: Giữ lịch khóa cổng trước 9h sáng và tắt mạng xã hội sau 23h..."
                  : "e.g. Lock gate before 9 AM and keep bedtime gate on..."
              }
              className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-[12.5px] text-ink"
            />
            <div className="flex justify-between">
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep(1)}>
                {isVi ? "← Quay lại" : "← Back"}
              </Button>
              <Button type="button" size="sm" variant="accent" onClick={() => setStep(3)}>
                {isVi ? "Dọn việc tồn đọng →" : "Triage backlog →"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-[12.5px] text-muted">
              {isVi
                ? "Bước 3: Chọn các việc tồn đọng không còn cần thiết để lưu trữ (archive), giữ danh sách tuần mới thật gọn:"
                : "Step 3: Select stale tasks to archive so next week starts clean:"}
            </p>
            {staleBacklog.length === 0 ? (
              <p className="text-[12px] text-success">
                <CheckCircle2 className="mr-1 inline size-3.5" />
                {isVi ? "Danh sách việc của bạn đã rất gọn gàng!" : "Your backlog is spotless!"}
              </p>
            ) : (
              <div className="max-h-44 space-y-1.5 overflow-y-auto">
                {staleBacklog.map((t) => {
                  const selected = archiveIds.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => toggleArchive(t.id)}
                      className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[12px] transition-colors ${
                        selected
                          ? "border-danger/40 bg-danger-soft/40 text-danger line-through"
                          : "border-line bg-surface-2/40 text-ink"
                      }`}
                    >
                      <span className="truncate">{t.title}</span>
                      <span className="ml-2 flex shrink-0 items-center gap-1 text-[11px] text-muted">
                        {t.daysOpen}d <Trash2 className="size-3" />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-between">
              <Button type="button" size="sm" variant="ghost" onClick={() => setStep(2)}>
                {isVi ? "← Quay lại" : "← Back"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="accent"
                disabled={pending}
                onClick={handleFinish}
              >
                <Sparkles className="size-3.5" />{" "}
                {isVi ? "Hoàn tất Tổng kết Tuần" : "Complete Weekly Review"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
