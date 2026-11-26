"use client";

import {
  Check,
  CheckSquare,
  Columns3,
  List,
  Plus,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";
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
  const [layout, setLayout] = useState<"list" | "board">("list");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inspectTask, setInspectTask] = useState<Task | null>(null);
  const [pending, startTransition] = useTransition();

  const planTaskByTaskId = new Map<string, PlanTask>(planTasks.map((pt) => [pt.taskId, pt]));

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    tasks: tasks.filter((task) => task.kind === kind),
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
        </div>

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
                    <div key={task.id} className="flex items-stretch">
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
