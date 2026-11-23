"use client";

import { Clock3, Plus, Target, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  createGoalAction,
  deleteGoalAction,
  incrementGoalAction,
  setPlanTaskScheduleAction,
} from "@/lib/actions/v2";
import type { GoalRecord, PlanScheduleItem } from "@/lib/data/v3-features";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";

export function V3GoalsTimeline({
  goals,
  schedules,
}: {
  goals: GoalRecord[];
  schedules: PlanScheduleItem[];
}) {
  const isVi = useLocale() === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Goals form
  const [goalTitle, setGoalTitle] = useState("");
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [targetValue, setTargetValue] = useState("10");
  const [unit, setUnit] = useState("hours");

  // Time-blocking form
  const [selectedTaskId, setSelectedTaskId] = useState(schedules[0]?.planTaskId ?? "");
  const [startTime, setStartTime] = useState("08:30");
  const [endTime, setEndTime] = useState("10:00");

  const scheduledSorted = [...schedules]
    .filter((s) => Boolean(s.scheduledStart))
    .sort((a, b) => (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    startTransition(async () => {
      const res = await createGoalAction({
        title: goalTitle,
        periodType,
        targetValue: Number(targetValue) || 1,
        unit,
      });
      if (res.error) toast.push("error", res.error);
      else if (res.success) {
        toast.push("success", res.success);
        setGoalTitle("");
      }
    });
  };

  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTaskId) return;
    startTransition(async () => {
      const res = await setPlanTaskScheduleAction({
        planTaskId: selectedTaskId,
        start: startTime || null,
        end: endTime || null,
      });
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock3 className="size-4 text-accent" />
            {isVi ? "Phân bổ khung giờ trong ngày" : "Daily Time-Blocking"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {schedules.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi
                ? "Hãy thêm nhiệm vụ vào kế hoạch hôm nay trước để gán khung giờ."
                : "Add tasks to today's plan first to assign time blocks."}
            </p>
          ) : (
            <form onSubmit={handleSaveSchedule} className="grid gap-2 sm:grid-cols-[1fr_95px_95px_auto] sm:items-end">
              <label className="block text-[11px]">
                <span className="text-muted">{isVi ? "Nhiệm vụ" : "Task"}</span>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="mt-1 h-9 w-full rounded-xl border border-line bg-surface px-2.5 text-[12px] text-ink"
                >
                  {schedules.map((s) => (
                    <option key={s.planTaskId} value={s.planTaskId}>
                      {s.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-[11px]">
                <span className="text-muted">{isVi ? "Bắt đầu" : "Start"}</span>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-[11px]">
                <span className="text-muted">{isVi ? "Kết thúc" : "End"}</span>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1"
                />
              </label>
              <Button type="submit" variant="accent" size="sm" disabled={pending} className="h-9">
                {isVi ? "Gán giờ" : "Assign"}
              </Button>
            </form>
          )}

          {scheduledSorted.length > 0 ? (
            <div className="space-y-2 border-t border-line pt-3">
              {scheduledSorted.map((item) => (
                <div
                  key={item.planTaskId}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-[12px]"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Badge tone="accent">
                      {item.scheduledStart}
                      {item.scheduledEnd ? ` – ${item.scheduledEnd}` : ""}
                    </Badge>
                    <span className={item.completed ? "truncate line-through text-muted" : "truncate font-medium"}>
                      {item.title}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await setPlanTaskScheduleAction({
                          planTaskId: item.planTaskId,
                          start: null,
                          end: null,
                        });
                      })
                    }
                  >
                    {isVi ? "Xóa" : "Clear"}
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4 text-accent" />
            {isVi ? "Mục tiêu Tuần & Tháng" : "Weekly & Monthly Goals"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <form onSubmit={handleCreateGoal} className="grid gap-2 sm:grid-cols-[1fr_95px_75px_85px_auto] sm:items-end">
            <label className="block text-[11px]">
              <span className="text-muted">{isVi ? "Mục tiêu" : "Goal"}</span>
              <Input
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                placeholder={isVi ? "VD: Học 15h Tiếng Anh" : "e.g. Study English 15h"}
                className="mt-1"
              />
            </label>
            <label className="block text-[11px]">
              <span className="text-muted">{isVi ? "Chu kỳ" : "Period"}</span>
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value === "monthly" ? "monthly" : "weekly")}
                className="mt-1 h-9 w-full rounded-xl border border-line bg-surface px-2 text-[12px] text-ink"
              >
                <option value="weekly">{isVi ? "Tuần" : "Weekly"}</option>
                <option value="monthly">{isVi ? "Tháng" : "Monthly"}</option>
              </select>
            </label>
            <label className="block text-[11px]">
              <span className="text-muted">{isVi ? "Chỉ tiêu" : "Target"}</span>
              <Input
                type="number"
                min={1}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-[11px]">
              <span className="text-muted">{isVi ? "Đơn vị" : "Unit"}</span>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder={isVi ? "giờ" : "hours"}
                className="mt-1"
              />
            </label>
            <Button type="submit" variant="accent" size="sm" disabled={pending || !goalTitle.trim()} className="h-9">
              <Plus className="size-3.5" /> {isVi ? "Thêm" : "Add"}
            </Button>
          </form>

          {goals.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi ? "Chưa có mục tiêu tuần hoặc tháng nào." : "No weekly or monthly goals yet."}
            </p>
          ) : (
            <div className="space-y-2.5 border-t border-line pt-3">
              {goals.map((g) => {
                const pct = Math.min(100, Math.round((g.currentValue / Math.max(1, g.targetValue)) * 100));
                return (
                  <div key={g.id} className="rounded-xl border border-line bg-surface-2/50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink">{g.title}</p>
                        <p className="text-[11px] text-muted">
                          {isVi ? (g.periodType === "weekly" ? "Tuần" : "Tháng") : g.periodType} ·{" "}
                          {g.currentValue}/{g.targetValue} {g.unit} ({pct}%)
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await incrementGoalAction(g.id, 1);
                              if (res.error) toast.push("error", res.error);
                            })
                          }
                        >
                          +1
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await deleteGoalAction(g.id);
                            })
                          }
                        >
                          <Trash2 className="size-3.5 text-muted" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} tone={pct >= 100 ? "success" : "accent"} className="mt-2 h-1.5" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
