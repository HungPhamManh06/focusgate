"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { addPlanTaskAction } from "@/lib/actions/planner";
import { formatDate, formatMinutes, relativeDue } from "@/lib/data/format";
import type { Task, TaskKind } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { getKindLabel } from "@/components/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const quickKinds: Array<{ kind: TaskKind; shortLabel: string; shortLabelVi: string }> = [
  { kind: "must_do", shortLabel: "+ Must-do", shortLabelVi: "+ Bắt buộc" },
  { kind: "should_do", shortLabel: "+ Should-do", shortLabelVi: "+ Nên làm" },
  { kind: "bonus", shortLabel: "+ Bonus", shortLabelVi: "+ Thưởng" },
];

export function AddPlanTask({
  planId,
  tasks,
  timezone = "Asia/Ho_Chi_Minh",
}: {
  planId: string;
  tasks: Task[];
  timezone?: string;
}) {
  const locale = useLocale();
  const isVi = locale === "vi";
  const [query, setQuery] = useState("");
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        (task.description?.toLowerCase().includes(q) ?? false),
    );
  }, [query, tasks]);

  function add(taskId: string, kind: TaskKind) {
    const key = `${taskId}:${kind}`;
    setAddingKey(key);
    startTransition(async () => {
      const result = await addPlanTaskAction({ planId, taskId, kind });
      setAddingKey(null);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  if (tasks.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        {isVi
          ? "Mọi nhiệm vụ đang mở đều đã có trong kế hoạch này. Tạo thêm ở màn hình Nhiệm vụ."
          : "Every open task is already in this plan. Create more from the Tasks screen."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {tasks.length > 4 ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isVi ? "Lọc nhiệm vụ trong hàng chờ…" : "Filter open backlog tasks…"}
            aria-label={isVi ? "Lọc nhiệm vụ trong hàng chờ" : "Filter backlog tasks"}
            className="h-9 pl-8 text-[12px]"
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-5 text-center text-[12px] text-muted">
          {isVi ? `Không có nhiệm vụ nào khớp "${query}".` : `No backlog tasks match "${query}".`}
        </p>
      ) : (
        <div className="max-h-[340px] divide-y divide-line overflow-y-auto rounded-xl border border-line bg-surface">
          {filtered.map((task) => {
            const relDue = relativeDue(task.dueDate, timezone, locale);
            const dueText =
              relDue ?? (task.dueDate ? formatDate(task.dueDate, undefined, timezone, locale) : null);
            const overdue = relDue ? (relDue.includes("overdue") || relDue.includes("Quá hạn")) : false;

            return (
              <div
                key={task.id}
                className="flex flex-col gap-2.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-[12.5px] font-medium text-ink">{task.title}</p>
                    {task.priority === "urgent" ? (
                      <Badge tone="danger">{isVi ? "Khẩn cấp" : "Urgent"}</Badge>
                    ) : null}
                    {task.priority === "high" ? (
                      <Badge tone="warning">{isVi ? "Cao" : "High"}</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                    <span>
                      {isVi ? "Mặc định:" : "Default:"} {getKindLabel(task.kind, locale)}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {task.requiredFocusMinutes > 0
                        ? `${formatMinutes(task.requiredFocusMinutes)} ${isVi ? "tập trung" : "focus"}`
                        : isVi ? "0m tập trung" : "0m focus"}
                    </span>
                    {dueText ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className={overdue ? "font-medium text-danger" : undefined}>
                          {dueText}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {quickKinds.map((option) => {
                    const isDefault = task.kind === option.kind;
                    const isLoading = pending && addingKey === `${task.id}:${option.kind}`;
                    return (
                      <button
                        key={option.kind}
                        type="button"
                        disabled={pending}
                        onClick={() => add(task.id, option.kind)}
                        className={cn(
                          "inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition-colors disabled:opacity-50",
                          isDefault
                            ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent hover:text-white"
                            : "border-line bg-surface-2/60 text-ink-soft hover:border-ink/25 hover:bg-surface-2",
                        )}
                      >
                        {isLoading ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        {(isVi ? option.shortLabelVi : option.shortLabel).replace("+ ", "")}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
