import Link from "next/link";
import { ArrowRight, ListTodo, Search, SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getTodayPlan } from "@/lib/data/planner";
import { getTaskCounts, listTasks, type TaskFilters } from "@/lib/data/tasks";
import { getV2Settings } from "@/lib/data/v2-settings";
import { getWorkspace } from "@/lib/data/workspace";
import type { TaskKind } from "@/lib/data/types";
import { getKindLabel } from "@/components/domain/labels";
import { cn } from "@/lib/utils";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskSearch } from "./task-search";
import { TasksWorkspaceClient } from "./tasks-workspace-client";

export const dynamic = "force-dynamic";

const kinds: TaskKind[] = ["must_do", "should_do", "bonus"];

interface SearchParams {
  view?: string;
  kind?: string;
  q?: string;
}

function buildHref(current: SearchParams, next: Partial<SearchParams>): string {
  const merged = { ...current, ...next };
  const params = new URLSearchParams();
  if (merged.view && merged.view !== "open") params.set("view", merged.view);
  if (merged.kind) params.set("kind", merged.kind);
  if (merged.q) params.set("q", merged.q);
  const query = params.toString();
  return query ? `/tasks?${query}` : "/tasks";
}

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const view = params.view === "all" || params.view === "done" ? params.view : "open";
  const kind = kinds.includes(params.kind as TaskKind) ? (params.kind as TaskKind) : undefined;
  const search = params.q?.trim() || undefined;

  const filters: TaskFilters = { view, kind: kind ?? null, search: search ?? null };

  const [workspace, tasks, counts, plan, v2Settings] = await Promise.all([
    getWorkspace(),
    listTasks(filters),
    getTaskCounts(),
    getTodayPlan(),
    getV2Settings().catch(() => null),
  ]);

  const locale = v2Settings?.language ?? "en";
  const isVi = locale === "vi";

  const viewTabs = [
    { value: "open", label: isVi ? "Đang mở" : "Open" },
    { value: "all", label: isVi ? "Tất cả" : "All" },
    { value: "done", label: isVi ? "Đã xong" : "Done" },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={isVi ? "Danh sách nhiệm vụ" : "Work queue"}
        title={isVi ? "Chọn việc thực sự quan trọng." : "Decide what matters."}
        description={
          isVi
            ? "Giữ danh sách rõ ràng: việc Bắt buộc được khóa bảo vệ, việc Nên làm giúp tiến lên, việc Thưởng kiếm thêm thời gian."
            : "Keep the list honest: must-dos are protected, should-dos move the day forward, bonuses earn extra time."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {counts.open > 0 && (!plan || plan.tasks.length === 0) ? (
              <Link
                href="/planner"
                className={buttonVariants({ variant: "outline", size: "md" })}
              >
                {isVi ? "Lập kế hoạch hôm nay" : "Build today's plan"}{" "}
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
            <TaskFormDialog />
          </div>
        }
      />

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-muted">
        <span>{counts.total} {isVi ? "tổng" : "total"}</span>
        <span className="size-1 rounded-full bg-line" aria-hidden />
        <span>{counts.open} {isVi ? "đang mở" : "open"}</span>
        <span className="size-1 rounded-full bg-line" aria-hidden />
        <span>{counts.completed} {isVi ? "đã xong" : "completed"}</span>
        <span className="size-1 rounded-full bg-line" aria-hidden />
        <span>{counts.mustDoOpen} {isVi ? "việc Bắt buộc còn lại" : "must-do remaining"}</span>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-[18px] border border-line bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          {viewTabs.map((tab) => (
            <Link
              key={tab.value}
              href={buildHref(params, { view: tab.value })}
              aria-current={view === tab.value ? "page" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                view === tab.value
                  ? "bg-ink text-canvas"
                  : "text-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-1">
            <SlidersHorizontal className="mx-1 size-3.5 text-muted" aria-hidden />
            <Link
              href={buildHref(params, { kind: undefined })}
              aria-current={!kind ? "page" : undefined}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                !kind
                  ? "border-ink/20 bg-surface-2 font-medium text-ink"
                  : "border-transparent text-muted hover:text-ink",
              )}
            >
              {isVi ? "Mọi loại" : "Any type"}
            </Link>
            {kinds.map((option) => (
              <Link
                key={option}
                href={buildHref(params, { kind: option === kind ? undefined : option })}
                aria-current={kind === option ? "page" : undefined}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                  kind === option
                    ? "border-accent/30 bg-accent-soft font-medium text-accent"
                    : "border-transparent text-muted hover:text-ink",
                )}
              >
                {getKindLabel(option, locale)}
              </Link>
            ))}
          </div>

          <TaskSearch initialQuery={search} />
        </div>
      </div>

      <div className="mt-4">
        {tasks.length === 0 ? (
          <Card>
            {counts.total === 0 ? (
              <EmptyState
                icon={ListTodo}
                title={isVi ? "Danh sách đang trống" : "Your list is empty"}
                description={
                  isVi
                    ? "Hãy thêm nhiệm vụ đầu tiên. Bắt đầu với một việc Bắt buộc mà ngày hôm nay thực sự phụ thuộc vào."
                    : "Add the first task. Start with one must-do — something the day genuinely depends on."
                }
                action={<TaskFormDialog />}
                className="border-0 bg-transparent shadow-none"
              />
            ) : (
              <EmptyState
                icon={Search}
                title={isVi ? "Không có nhiệm vụ phù hợp" : "No tasks match this view"}
                description={
                  isVi
                    ? "Thử đổi trạng thái, loại nhiệm vụ hoặc từ khóa tìm kiếm."
                    : "Try another status, task type, or search phrase."
                }
                action={
                  <Link href="/tasks" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {isVi ? "Xóa bộ lọc" : "Clear filters"}
                  </Link>
                }
                className="border-0 bg-transparent shadow-none"
              />
            )}
          </Card>
        ) : (
          <TasksWorkspaceClient
            tasks={tasks}
            timezone={workspace.profile.timezone}
            planId={plan?.id ?? null}
            planStatus={plan?.status ?? null}
            planTasks={plan?.tasks ?? []}
          />
        )}
      </div>
    </div>
  );
}
