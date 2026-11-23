"use client";

import { ArrowRight, CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import { useState, useTransition } from "react";
import { rolloverTasksAction, smartBreakdownAction } from "@/lib/actions/v2";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function V2PlannerTools({
  todayDate,
  yesterdayDate,
  tomorrowDate,
  totalTasks,
  completedTasks,
  focusMinutes,
}: {
  todayDate: string;
  yesterdayDate: string;
  tomorrowDate: string;
  totalTasks: number;
  completedTasks: number;
  focusMinutes: number;
}) {
  const isVi = useLocale() === "vi";
  const [goal, setGoal] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const completionPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const handleBreakdown = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    startTransition(async () => {
      const res = await smartBreakdownAction(goal, true);
      if (res.error) toast.push("error", res.error);
      else if (res.success) {
        toast.push("success", res.success);
        setGoal("");
      }
    });
  };

  const handleRollover = (fromDate: string, toDate: string) => {
    startTransition(async () => {
      const res = await rolloverTasksAction(fromDate, toDate);
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="size-4 text-accent" />
            {isVi ? "Chia nhỏ mục tiêu thông minh" : "Smart Goal Breakdown"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-[12px] text-muted">
            {isVi
              ? "Nhập một mục tiêu lớn để tự động tách thành 3–4 nhiệm vụ nhỏ cho kế hoạch hôm nay."
              : "Enter one big goal and automatically split it into 3–4 actionable subtasks for today's plan."}
          </p>
          <form onSubmit={handleBreakdown} className="mt-3 flex gap-2">
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={isVi ? "VD: Ôn thi Hệ điều hành chương 3" : "e.g. Study OS Chapter 3"}
              disabled={pending}
            />
            <Button type="submit" variant="accent" size="sm" disabled={pending || !goal.trim()}>
              <Sparkles className="size-3.5" /> {isVi ? "Tách việc" : "Split"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            {isVi ? "Tổng kết ngày & Chuyển việc" : "Daily Review & Rollover"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-[12px] text-muted">
            {isVi ? "Hôm nay:" : "Today:"}{" "}
            <span className="font-semibold text-ink">{completedTasks}/{totalTasks}</span>{" "}
            {isVi ? "nhiệm vụ" : "tasks"} ({completionPct}%) ·{" "}
            <span className="font-semibold text-ink">{focusMinutes}m</span>{" "}
            {isVi ? "tập trung." : "focused."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => handleRollover(yesterdayDate, todayDate)}
            >
              {isVi ? "Kéo việc chưa xong từ hôm qua" : "Pull unfinished from yesterday"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => handleRollover(todayDate, tomorrowDate)}
            >
              {isVi ? "Chuyển việc chưa xong sang ngày mai" : "Roll unfinished to tomorrow"}{" "}
              <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
