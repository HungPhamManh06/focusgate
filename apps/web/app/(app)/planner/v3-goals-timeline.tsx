"use client";

import { AlertTriangle, CalendarClock, Clock3, GripVertical, Plus, Target, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import {
  createGoalAction,
  deleteGoalAction,
  incrementGoalAction,
  setPlanTaskScheduleAction,
} from "@/lib/actions/v2";
import type { GoalRecord, PlanScheduleItem } from "@/lib/data/v3-features";
import { computeCapacityAnalysis } from "@/lib/domain/focus-coach";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const TIMELINE_HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 08:00 -> 22:00

function addMinutesToTime(hhmm: string, deltaMinutes: number): string {
  const [hStr, mStr] = hhmm.split(":");
  const total = Math.min(23 * 60 + 45, Number(hStr || 8) * 60 + Number(mStr || 0) + deltaMinutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function V3GoalsTimeline({
  goals,
  schedules,
  pendingEstimatedMinutes = 0,
  bedtimeStartHour = 22,
}: {
  goals: GoalRecord[];
  schedules: PlanScheduleItem[];
  pendingEstimatedMinutes?: number;
  bedtimeStartHour?: number;
}) {
  const isVi = useLocale() === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // Goals form
  const [goalTitle, setGoalTitle] = useState("");
  const [periodType, setPeriodType] = useState<"weekly" | "monthly">("weekly");
  const [targetValue, setTargetValue] = useState("10");
  const [unit, setUnit] = useState("hours");

  // Visual drag-and-drop state
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dropHoverHour, setDropHoverHour] = useState<number | null>(null);

  const capacity = useMemo(
    () => computeCapacityAnalysis(pendingEstimatedMinutes, undefined, undefined, bedtimeStartHour),
    [pendingEstimatedMinutes, bedtimeStartHour],
  );

  const unscheduled = schedules.filter((s) => !s.scheduledStart);
  const scheduledByHour = useMemo(() => {
    const map = new Map<number, PlanScheduleItem[]>();
    for (const item of schedules) {
      if (!item.scheduledStart) continue;
      const hour = Number.parseInt(item.scheduledStart.slice(0, 2), 10);
      if (!Number.isFinite(hour)) continue;
      const clamped = Math.max(8, Math.min(22, hour));
      const list = map.get(clamped) ?? [];
      list.push(item);
      map.set(clamped, list);
    }
    return map;
  }, [schedules]);

  const assignToHour = (planTaskId: string, hour: number) => {
    const start = `${String(hour).padStart(2, "0")}:00`;
    const end = addMinutesToTime(start, 60);
    startTransition(async () => {
      const res = await setPlanTaskScheduleAction({ planTaskId, start, end });
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", isVi ? `Đã đặt lịch ${start}–${end}` : `Scheduled ${start}–${end}`);
    });
  };

  const clearSchedule = (planTaskId: string) => {
    startTransition(async () => {
      const res = await setPlanTaskScheduleAction({ planTaskId, start: null, end: null });
      if (res.error) toast.push("error", res.error);
    });
  };

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

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-12">
      {/* Visual Time-Blocking Timeline (08:00 -> 22:00) */}
      <Card className="lg:col-span-7">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="size-4 text-accent" />
            {isVi ? "Trục thời gian trực quan (08:00 → 22:00)" : "Visual Time-Blocking (08:00 → 22:00)"}
          </CardTitle>
          <Badge tone={capacity.isOverCapacity ? "warning" : "neutral"}>
            <Clock3 className="mr-1 size-3" />
            {isVi
              ? `Còn ${Math.floor(capacity.remainingMinutesToday / 60)}h${capacity.remainingMinutesToday % 60}p hôm nay`
              : `${Math.floor(capacity.remainingMinutesToday / 60)}h ${capacity.remainingMinutesToday % 60}m left today`}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          {capacity.isOverCapacity && (
            <div className="flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft/50 px-3.5 py-2.5 text-[12px] text-ink">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <p>
                {isVi
                  ? `Cảnh báo quá tải: Tổng thời lượng việc chưa xong (~${capacity.plannedMinutes}p) đang vượt quỹ giờ còn lại trong ngày khoảng ${capacity.overCapacityMinutes} phút. Cân nhắc dời bớt việc ít quan trọng.`
                  : `Over-capacity warning: Pending tasks (~${capacity.plannedMinutes}m) exceed remaining time today by ~${capacity.overCapacityMinutes}m. Consider deferring lower-priority items.`}
              </p>
            </div>
          )}

          {schedules.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi
                ? "Hãy thêm nhiệm vụ vào kế hoạch hôm nay trước để kéo-thả lên trục thời gian."
                : "Add tasks to today's plan first to drag & drop onto your timeline."}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              {/* Unscheduled tray */}
              <div className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  {isVi ? `Chưa gán giờ (${unscheduled.length})` : `Unscheduled (${unscheduled.length})`}
                </p>
                {unscheduled.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line p-3 text-[11.5px] text-muted">
                    {isVi ? "Mọi nhiệm vụ đều đã có khung giờ!" : "All tasks are time-blocked!"}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {unscheduled.map((item) => (
                      <div
                        key={item.planTaskId}
                        draggable
                        onDragStart={() => setDraggedTaskId(item.planTaskId)}
                        onDragEnd={() => {
                          setDraggedTaskId(null);
                          setDropHoverHour(null);
                        }}
                        className="group flex cursor-grab items-center justify-between gap-1.5 rounded-xl border border-line bg-surface-2/70 px-2.5 py-2 text-[12px] active:cursor-grabbing hover:border-accent/40"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <GripVertical className="size-3.5 shrink-0 text-muted" />
                          <span className="truncate font-medium text-ink">{item.title}</span>
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => assignToHour(item.planTaskId, Math.max(8, Math.min(21, new Date().getHours() + 1)))}
                          className="shrink-0 rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/20"
                        >
                          +
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Drop-target hourly slots */}
              <div className="max-h-[360px] space-y-1 overflow-y-auto pr-1">
                {TIMELINE_HOURS.map((hour) => {
                  const slotItems = scheduledByHour.get(hour) ?? [];
                  const isHovered = dropHoverHour === hour;
                  return (
                    <div
                      key={hour}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDropHoverHour(hour);
                      }}
                      onDragLeave={() => setDropHoverHour((prev) => (prev === hour ? null : prev))}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedTaskId) assignToHour(draggedTaskId, hour);
                        setDraggedTaskId(null);
                        setDropHoverHour(null);
                      }}
                      className={cn(
                        "flex min-h-[36px] items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-colors",
                        isHovered
                          ? "border-accent bg-accent-soft/50"
                          : slotItems.length > 0
                            ? "border-line bg-surface"
                            : "border-line/50 bg-surface-2/30",
                      )}
                    >
                      <span className="w-11 shrink-0 font-mono text-[11px] text-muted">
                        {String(hour).padStart(2, "0")}:00
                      </span>
                      <div className="flex flex-1 flex-wrap gap-1.5">
                        {slotItems.length === 0 ? (
                          <span className="text-[11px] text-muted/50">
                            {isHovered
                              ? isVi
                                ? "Thả vào đây..."
                                : "Drop here..."
                              : ""}
                          </span>
                        ) : (
                          slotItems.map((item) => (
                            <div
                              key={item.planTaskId}
                              draggable
                              onDragStart={() => setDraggedTaskId(item.planTaskId)}
                              className={cn(
                                "flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] font-medium",
                                item.completed
                                  ? "border-success/30 bg-success-soft/50 text-success line-through"
                                  : "border-accent/30 bg-accent-soft/60 text-ink",
                              )}
                            >
                              <span className="truncate max-w-[190px]">{item.title}</span>
                              <span className="font-mono text-[10px] text-muted">
                                {item.scheduledStart}–{item.scheduledEnd ?? ""}
                              </span>
                              <button
                                type="button"
                                onClick={() => clearSchedule(item.planTaskId)}
                                className="rounded p-0.5 text-muted hover:text-ink"
                                aria-label="Clear schedule"
                              >
                                <X className="size-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly & Monthly Goals */}
      <Card className="lg:col-span-5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4 text-accent" />
            {isVi ? "Mục tiêu Tuần & Tháng" : "Weekly & Monthly Goals"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <form onSubmit={handleCreateGoal} className="space-y-2">
            <Input
              value={goalTitle}
              onChange={(e) => setGoalTitle(e.target.value)}
              placeholder={isVi ? "VD: 15 giờ lập trình sâu tuần này" : "e.g. 15 hours deep coding this week"}
              disabled={pending}
            />
            <div className="grid grid-cols-[1fr_76px_80px_auto] gap-2">
              <select
                value={periodType}
                onChange={(e) => setPeriodType(e.target.value === "monthly" ? "monthly" : "weekly")}
                className="h-9 rounded-xl border border-line bg-surface px-2.5 text-[12px] text-ink"
              >
                <option value="weekly">{isVi ? "Theo tuần" : "Weekly"}</option>
                <option value="monthly">{isVi ? "Theo tháng" : "Monthly"}</option>
              </select>
              <Input
                type="number"
                min={1}
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
              />
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="hours" />
              <Button type="submit" variant="accent" size="sm" disabled={pending || !goalTitle.trim()}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          </form>

          {goals.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi ? "Chưa có mục tiêu nào." : "No active goals yet."}
            </p>
          ) : (
            <div className="space-y-2.5">
              {goals.map((g) => {
                const pct = Math.min(100, Math.round((g.currentValue / Math.max(1, g.targetValue)) * 100));
                return (
                  <div key={g.id} className="rounded-xl border border-line bg-surface-2/40 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink">{g.title}</p>
                        <p className="text-[11px] text-muted">
                          {g.currentValue} / {g.targetValue} {g.unit} ({pct}%)
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
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
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              const res = await deleteGoalAction(g.id);
                              if (res.error) toast.push("error", res.error);
                            })
                          }
                        >
                          <Trash2 className="size-3.5 text-muted" />
                        </Button>
                      </div>
                    </div>
                    <Progress value={pct} className="mt-2 h-1.5" />
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
