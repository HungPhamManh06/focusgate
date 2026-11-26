"use client";

import {
  Check,
  CheckSquare,
  Columns3,
  GripVertical,
  List,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { addSuggestedTaskToTodayPlanAction } from "@/lib/actions/planner";
import { completeTaskAction, deleteTaskAction } from "@/lib/actions/tasks";
import type { PlanStatus, PlanTask, Task, TaskKind } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { getCategoryLabel, getKindLabel, kindDescriptions } from "@/components/domain/labels";
import { TaskInspectorDrawer } from "@/components/domain/task-inspector-drawer";
import { cn } from "@/lib/utils";
import { TaskRow } from "./task-row";
import { TaskTemplatesStrip } from "./task-templates-strip";

const KIND_ORDER: TaskKind[] = ["must_do", "should_do", "bonus"];

const KIND_DESCRIPTIONS_VI: Record<TaskKind, string> = {
  must_do: "Được bảo vệ bởi phiên tập trung và bắt buộc hoàn thành để mở khóa ngày.",
  should_do: "Đẩy tiến độ công việc sau khi đã lo xong các việc cốt lõi.",
  bonus: "Nhiệm vụ tùy chọn giúp kiếm thêm phút thưởng.",
};

const CATEGORY_DOT_COLORS: Record<string, string> = {
  work: "bg-accent",
  study: "bg-indigo-500",
  health: "bg-success",
  personal: "bg-warning",
  finance: "bg-teal-500",
  other: "bg-muted",
};

export function TasksWorkspaceClient({
  tasks,
  timezone,
  planId,
  planStatus,
  planTasks,
}: {
  tasks: Task[];
  timezone: string;
  planId: string | null;
  planStatus: PlanStatus | null;
  planTasks: PlanTask[];
}) {
  const locale = useLocale();
  const isVi = locale === "vi";
  const toast = useToast();
  const [layout, setLayout] = useState<"list" | "board" | "matrix">("list");
  const [smartFilter, setSmartFilter] = useState<"all" | "habit" | "due" | "high">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<"default" | "priority" | "shortest" | "due">("default");
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectTask, setInspectTask] = useState<Task | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("focusgate-task-order") || "[]") as string[];
      if (Array.isArray(saved)) setCustomOrder(saved);
    } catch {
      // ignore
    }
  }, []);

  function moveTaskBefore(sourceId: string, targetId: string) {
    if (sourceId === targetId) return;
    const base = tasks.map((t) => t.id);
    const merged = [...customOrder.filter((id) => base.includes(id)), ...base.filter((id) => !customOrder.includes(id))];
    const next = merged.filter((id) => id !== sourceId);
    const targetIdx = next.indexOf(targetId);
    if (targetIdx === -1) next.push(sourceId);
    else next.splice(targetIdx, 0, sourceId);
    setCustomOrder(next);
    try {
      window.localStorage.setItem("focusgate-task-order", JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  const planTaskByTaskId = new Map<string, PlanTask>(planTasks.map((pt) => [pt.taskId, pt]));

  const filteredTasks = tasks.filter((t) => {
    if (hideCompleted && t.status === "completed") return false;
    if (categoryFilter !== "all" && (t.category || "other") !== categoryFilter) return false;
    if (smartFilter === "habit") return Boolean(t.isDailyHabit);
    if (smartFilter === "due") return Boolean(t.dueDate);
    if (smartFilter === "high") return t.priority === "urgent" || t.priority === "high";
    return true;
  });

  const openMinutesBudget = tasks
    .filter((t) => t.status !== "completed")
    .reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);
  const dailyBudgetCap = 360;
  const budgetPct = Math.min(100, Math.round((openMinutesBudget / dailyBudgetCap) * 100));
  const overBudget = openMinutesBudget > dailyBudgetCap;

  const priorityRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    if (sortBy === "priority") {
      return (priorityRank[a.priority] ?? 2) - (priorityRank[b.priority] ?? 2);
    }
    if (sortBy === "shortest") {
      return a.estimatedMinutes - b.estimatedMinutes;
    }
    if (sortBy === "due") {
      const da = a.dueDate ? new Date(a.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      const db = b.dueDate ? new Date(b.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
      return da - db;
    }
    if (customOrder.length > 0) {
      const ia = customOrder.indexOf(a.id);
      const ib = customOrder.indexOf(b.id);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
    }
    return 0;
  });

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    tasks: sortedTasks.filter((task) => task.kind === kind),
  }));

  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
    setSelectMode(false);
  }

  function runBulk(action: "complete" | "today" | "delete") {
    const targets = tasks.filter((t) => selectedIds.has(t.id));
    if (targets.length === 0) return;
    startTransition(async () => {
      let ok = 0;
      for (const task of targets) {
        if (action === "complete" && task.status !== "completed") {
          const res = await completeTaskAction(task.id);
          if (!res.error) ok += 1;
        } else if (action === "today" && !planTaskByTaskId.has(task.id) && task.status !== "completed") {
          const res = await addSuggestedTaskToTodayPlanAction({
            planId,
            taskId: task.id,
            kind: task.kind,
          });
          if (!res.error) ok += 1;
        } else if (action === "delete") {
          const res = await deleteTaskAction(task.id);
          if (!res.error) ok += 1;
        }
      }
      toast.push(
        "success",
        isVi ? `Đã cập nhật ${ok}/${targets.length} nhiệm vụ.` : `Updated ${ok}/${targets.length} tasks.`,
      );
      clearSelection();
    });
  }

  return (
    <div>
      <div className="mb-3 space-y-2.5">
        <TaskTemplatesStrip />

        {/* FocusGate 8.0: Daily Time-Budget Meter & Category Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-[11.5px]">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: isVi ? "Tất cả" : "All" },
                { id: "work", label: getCategoryLabel("work", locale) },
                { id: "study", label: getCategoryLabel("study", locale) },
                { id: "health", label: getCategoryLabel("health", locale) },
                { id: "personal", label: getCategoryLabel("personal", locale) },
                { id: "finance", label: getCategoryLabel("finance", locale) },
              ] as const
            ).map((cat) => {
              const count =
                cat.id === "all"
                  ? tasks.length
                  : tasks.filter((t) => (t.category || "other") === cat.id).length;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    categoryFilter === cat.id
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-surface-2/60 text-muted hover:text-ink",
                  )}
                >
                  {cat.id !== "all" ? (
                    <span
                      aria-hidden
                      className={cn("size-1.5 rounded-full", CATEGORY_DOT_COLORS[cat.id] ?? "bg-muted")}
                    />
                  ) : null}
                  {cat.label}
                  <span className="opacity-70 tabular-nums">{count}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("font-medium tabular-nums", overBudget ? "text-warning" : "text-muted")}>
              {isVi ? "Ngân sách ngày:" : "Time budget:"} {Math.floor(openMinutesBudget / 60)}h{openMinutesBudget % 60}m / 6h
            </span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn("h-full rounded-full transition-all", overBudget ? "bg-warning" : "bg-accent")}
                style={{ width: `${budgetPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-[11.5px]">
          <button
            type="button"
            onClick={() => setLayout("list")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
              layout === "list" ? "bg-ink text-canvas" : "text-muted hover:text-ink",
            )}
          >
            <List className="size-3.5" />
            {isVi ? "Danh sách" : "List"}
          </button>
          <button
            type="button"
            onClick={() => setLayout("board")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
              layout === "board" ? "bg-ink text-canvas" : "text-muted hover:text-ink",
            )}
          >
            <Columns3 className="size-3.5" />
            {isVi ? "Bảng 3 cột" : "Board"}
          </button>
          <button
            type="button"
            onClick={() => setLayout("matrix")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors",
              layout === "matrix" ? "bg-ink text-canvas" : "text-muted hover:text-ink",
            )}
          >
            {isVi ? "Ma trận 2×2" : "Matrix"}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: "all", label: isVi ? "Tất cả" : "All" },
              { id: "habit", label: isVi ? "Thói quen" : "Habits" },
              { id: "due", label: isVi ? "Có hạn" : "Has due" },
              { id: "high", label: isVi ? "Ưu tiên cao" : "High priority" },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSmartFilter(f.id)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                smartFilter === f.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label={isVi ? "Sắp xếp nhiệm vụ" : "Sort tasks"}
            value={sortBy}
            onChange={(e) =>
              setSortBy(e.target.value as "default" | "priority" | "shortest" | "due")
            }
            className="h-8 rounded-full border border-line bg-surface px-3 text-[11.5px] font-medium text-ink-soft focus:border-accent focus:outline-none"
          >
            <option value="default">{isVi ? "Sắp xếp: Mặc định" : "Sort: Default"}</option>
            <option value="priority">{isVi ? "Ưu tiên cao nhất" : "Highest priority"}</option>
            <option value="shortest">{isVi ? "Ngắn nhất trước" : "Shortest first"}</option>
            <option value="due">{isVi ? "Hạn gần nhất" : "Soonest due"}</option>
          </select>

          {tasks.some((t) => t.status === "completed") ? (
            <button
              type="button"
              onClick={() => setHideCompleted((v) => !v)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
                hideCompleted
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {hideCompleted
                ? isVi
                  ? "Hiện việc đã xong"
                  : "Show done"
                : isVi
                  ? "Ẩn việc đã xong"
                  : "Hide done"}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (selectMode) clearSelection();
              else setSelectMode(true);
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
              selectMode
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            <CheckSquare className="size-3.5" />
            {selectMode
              ? isVi
                ? `Đang chọn (${selectedIds.size})`
                : `Selecting (${selectedIds.size})`
              : isVi
                ? "Chọn nhiều"
                : "Bulk select"}
          </button>
        </div>
      </div>

      {layout === "list" ? (
        <div className="space-y-6">
          {groups
            .filter((g) => g.tasks.length > 0)
            .map((group) => (
              <section key={group.kind} aria-labelledby={`group-${group.kind}`}>
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <div>
                    <h2 id={`group-${group.kind}`} className="text-[13px] font-semibold">
                      {getKindLabel(group.kind, locale)}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {isVi ? KIND_DESCRIPTIONS_VI[group.kind] : kindDescriptions[group.kind]}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {isVi
                      ? `${group.tasks.length} nhiệm vụ`
                      : `${group.tasks.length} task${group.tasks.length === 1 ? "" : "s"}`}
                  </span>
                </div>
                <Card className="overflow-hidden">
                  {group.tasks.map((task) => (
                    <div
                      key={task.id}
                      draggable={sortBy === "default"}
                      onDragStart={() => setDragId(task.id)}
                      onDragOver={(e) => {
                        if (sortBy === "default") e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragId && sortBy === "default") moveTaskBefore(dragId, task.id);
                        setDragId(null);
                      }}
                      className={cn(
                        "flex items-stretch",
                        dragId === task.id && "opacity-50",
                      )}
                    >
                      {sortBy === "default" && !selectMode ? (
                        <span
                          title={isVi ? "Kéo để sắp xếp lại" : "Drag to reorder"}
                          className="hidden cursor-grab items-center pl-2 text-muted/45 hover:text-ink sm:flex"
                        >
                          <GripVertical className="size-3.5" />
                        </span>
                      ) : null}
                      {selectMode ? (
                        <button
                          type="button"
                          onClick={() => toggleSelect(task.id)}
                          aria-label={`Select ${task.title}`}
                          className="flex items-center justify-center border-b border-r border-line px-3 text-muted hover:bg-surface-2 hover:text-accent"
                        >
                          {selectedIds.has(task.id) ? (
                            <CheckSquare className="size-4 text-accent" />
                          ) : (
                            <Square className="size-4" />
                          )}
                        </button>
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <TaskRow
                          task={task}
                          timezone={timezone}
                          planId={planId}
                          planStatus={planStatus}
                          planTask={planTaskByTaskId.get(task.id) ?? null}
                        />
                      </div>
                    </div>
                  ))}
                </Card>
              </section>
            ))}
        </div>
      ) : layout === "matrix" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              {
                id: "q1",
                title: isVi ? "🔥 Làm ngay (Khẩn & Quan trọng)" : "🔥 Do First (Urgent & Important)",
                items: sortedTasks.filter((t) => t.kind === "must_do" && (t.priority === "urgent" || t.priority === "high")),
              },
              {
                id: "q2",
                title: isVi ? "📅 Lên lịch (Quan trọng)" : "📅 Schedule (Important)",
                items: sortedTasks.filter((t) => t.kind === "must_do" && t.priority !== "urgent" && t.priority !== "high"),
              },
              {
                id: "q3",
                title: isVi ? "⚡ Làm nhanh (Nên làm)" : "⚡ Quick Wins (Should-do)",
                items: sortedTasks.filter((t) => t.kind === "should_do"),
              },
              {
                id: "q4",
                title: isVi ? "🎁 Để sau / Thưởng (Tùy chọn)" : "🎁 Bonus / Later",
                items: sortedTasks.filter((t) => t.kind === "bonus"),
              },
            ] as const
          ).map((quad) => (
            <div key={quad.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-[12.5px] font-semibold text-ink">{quad.title}</h3>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-muted">
                  {quad.items.length}
                </span>
              </div>
              {quad.items.length === 0 ? (
                <p className="py-4 text-center text-[11.5px] text-muted">
                  {isVi ? "Trống" : "Empty"}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {quad.items.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setInspectTask(task)}
                      className="flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-left text-[12.5px] transition-colors hover:border-accent/40 hover:text-accent"
                    >
                      <span className={cn("truncate font-medium", task.status === "completed" && "text-muted line-through")}>
                        {task.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">{task.estimatedMinutes}m</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {groups.map((group) => (
            <div
              key={group.kind}
              className="flex flex-col rounded-2xl border border-line bg-surface-2/40 p-3"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-[13px] font-semibold text-ink">
                  {getKindLabel(group.kind, locale)}
                </h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-medium text-muted">
                  {group.tasks.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {group.tasks.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11.5px] text-muted">
                    {isVi ? "Chưa có việc ở cột này" : "No tasks in this column"}
                  </p>
                ) : (
                  group.tasks.map((task) => {
                    const isDone = task.status === "completed";
                    const inPlan = planTaskByTaskId.has(task.id);
                    const isSelected = selectedIds.has(task.id);
                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "rounded-xl border bg-surface p-3.5 transition-all hover:border-accent/40",
                          isSelected ? "border-accent ring-1 ring-accent/40" : "border-line",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {selectMode ? (
                              <button
                                type="button"
                                onClick={() => toggleSelect(task.id)}
                                className="mt-0.5 text-muted hover:text-accent"
                              >
                                {isSelected ? (
                                  <CheckSquare className="size-4 text-accent" />
                                ) : (
                                  <Square className="size-4" />
                                )}
                              </button>
                            ) : (
                              <span
                                aria-hidden
                                className={cn(
                                  "mt-1.5 size-2 shrink-0 rounded-full",
                                  CATEGORY_DOT_COLORS[task.category] ?? "bg-muted",
                                )}
                              />
                            )}
                            <button
                              type="button"
                              onClick={() => setInspectTask(task)}
                              className={cn(
                                "text-left text-[13.5px] font-medium leading-snug hover:text-accent",
                                isDone && "text-muted line-through",
                              )}
                            >
                              {task.title}
                            </button>
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                          <span>{getCategoryLabel(task.category, locale)}</span>
                          <span>·</span>
                          <span>{task.estimatedMinutes}m</span>
                          {inPlan ? (
                            <Badge tone="accent">{isVi ? "Hôm nay" : "Today"}</Badge>
                          ) : null}
                          {isDone ? (
                            <Badge tone="success">{isVi ? "Đã xong" : "Done"}</Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectMode && selectedIds.size > 0 ? (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 lg:bottom-6">
          <div className="fg-animate-in flex flex-wrap items-center gap-2 rounded-full border border-line bg-ink px-4 py-2 text-canvas shadow-2xl">
            <span className="text-[12px] font-medium">
              {isVi ? `Đã chọn ${selectedIds.size}` : `${selectedIds.size} selected`}
            </span>
            <span className="h-4 w-px bg-canvas/20" aria-hidden />
            <Button
              type="button"
              size="sm"
              variant="subtle"
              disabled={pending}
              onClick={() => runBulk("today")}
            >
              <Plus className="size-3.5" />
              {isVi ? "Vào hôm nay" : "Add to today"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={pending}
              onClick={() => runBulk("complete")}
            >
              <Check className="size-3.5" />
              {isVi ? "Hoàn thành" : "Complete"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              disabled={pending}
              onClick={() => runBulk("delete")}
            >
              <Trash2 className="size-3.5" />
              {isVi ? "Xóa" : "Delete"}
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              aria-label={isVi ? "Bỏ chọn" : "Clear selection"}
              className="ml-1 rounded-full p-1 text-canvas/70 hover:bg-canvas/15 hover:text-canvas"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ) : null}

      {inspectTask ? (
        <TaskInspectorDrawer
          task={inspectTask}
          open={Boolean(inspectTask)}
          onClose={() => setInspectTask(null)}
        />
      ) : null}
    </div>
  );
}
