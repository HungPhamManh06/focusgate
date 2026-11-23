"use client";

import { ArrowRight, CheckCircle2, Sparkles, Wand2 } from "lucide-react";
import { useState, useTransition } from "react";
import { rolloverTasksAction, smartBreakdownAction } from "@/lib/actions/v2";
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
            Smart Goal Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-[12px] text-muted">
            Enter one big goal and automatically split it into 3–4 actionable subtasks for today&apos;s plan.
          </p>
          <form onSubmit={handleBreakdown} className="mt-3 flex gap-2">
            <Input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Ôn thi Hệ điều hành chương 3"
              disabled={pending}
            />
            <Button type="submit" variant="accent" size="sm" disabled={pending || !goal.trim()}>
              <Sparkles className="size-3.5" /> Split
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-success" />
            Daily Review &amp; Rollover
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <p className="text-[12px] text-muted">
            Today: <span className="font-semibold text-ink">{completedTasks}/{totalTasks}</span>{" "}
            tasks ({completionPct}%) · <span className="font-semibold text-ink">{focusMinutes}m</span>{" "}
            focused.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => handleRollover(yesterdayDate, todayDate)}
            >
              Pull unfinished from yesterday
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => handleRollover(todayDate, tomorrowDate)}
            >
              Roll unfinished to tomorrow <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
