"use client";

import { Bot, Scissors, Sparkles } from "lucide-react";
import { useTransition } from "react";
import { splitStalledTaskAction } from "@/lib/actions/v4";
import type { StalledTaskItem } from "@/lib/data/v4-ecosystem";
import type { CoachInsight } from "@/lib/domain/focus-coach";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function AiCoachCard({
  stalledTasks,
  insights,
}: {
  stalledTasks: StalledTaskItem[];
  insights: CoachInsight[];
}) {
  const isVi = useLocale() === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const handleSplit = (title: string) => {
    startTransition(async () => {
      const res = await splitStalledTaskAction(title);
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-4 text-accent" />
          {isVi ? "AI Focus Coach · Gỡ rối trì hoãn" : "AI Focus Coach · Procrastination Breaker"}
        </CardTitle>
        <Badge tone="neutral">
          <Sparkles className="mr-1 size-3" />
          {isVi ? "Phân tích trực tiếp" : "Live insights"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        {stalledTasks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
              {isVi
                ? "Việc bị dời nhiều lần — tách nhỏ để bắt đầu ngay"
                : "Stalled tasks — split into 10m micro-steps"}
            </p>
            {stalledTasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning-soft/35 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[12.5px] font-semibold text-ink">{task.title}</p>
                  <p className="text-[11px] text-muted">
                    {isVi
                      ? `Đã mở ${task.daysOpen} ngày · xuất hiện ${task.planAppearances} lần — việc này hơi lớn phải không?`
                      : `Open ${task.daysOpen}d · deferred ${task.planAppearances}x — too big to start?`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="accent"
                  disabled={pending}
                  onClick={() => handleSplit(task.title)}
                >
                  <Scissors className="size-3" /> {isVi ? "Tách 3 bước" : "Split x3"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {insights.length > 0 && (
          <div className="space-y-2">
            <p className="text-[11.5px] font-semibold uppercase tracking-wider text-muted">
              {isVi ? "Nhận xét cá nhân hóa tuần này" : "Weekly personalized coaching"}
            </p>
            <div className="grid gap-2">
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className="rounded-xl border border-line bg-surface-2/40 px-3 py-2.5"
                >
                  <p className="text-[12.5px] font-semibold text-ink">
                    {isVi ? ins.titleVi : ins.titleEn}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                    {isVi ? ins.bodyVi : ins.bodyEn}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
