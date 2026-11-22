import Link from "next/link";
import { ArrowRight, ListTodo, Search, SlidersHorizontal } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getTodayPlan } from "@/lib/data/planner";
import { getTaskCounts, listTasks, type TaskFilters } from "@/lib/data/tasks";
import { getWorkspace } from "@/lib/data/workspace";
import type { PlanTask, TaskKind } from "@/lib/data/types";
import { kindDescriptions, kindLabels } from "@/components/domain/labels";
import { cn } from "@/lib/utils";
import { TaskFormDialog } from "./task-form-dialog";
import { TaskRow } from "./task-row";
import { TaskSearch } from "./task-search";

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

  const [workspace, tasks, counts, plan] = await Promise.all([
    getWorkspace(),
    listTasks(filters),
    getTaskCounts(),
    getTodayPlan(),
  ]);

  const planTaskByTaskId = new Map<string, PlanTask>(
    (plan?.tasks ?? []).map((pt) => [pt.taskId, pt]),
  );

  const groups = kinds
    .map((groupKind) => ({
      kind: groupKind,
      tasks: tasks.filter((task) => task.kind === groupKind),
    }))
    .filter((group) => group.tasks.length > 0);

  const viewTabs = [
    { value: "open", label: "Open" },
    { value: "all", label: "All" },
    { value: "done", label: "Done" },
  ] as const;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Work queue"
        title="Decide what matters."
        description="Keep the list honest: must-dos are protected, should-dos move the day forward, bonuses earn extra time."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {counts.open > 0 && (!plan || plan.tasks.length === 0) ? (
              <Link
                href="/planner"
                className={buttonVariants({ variant: "outline", size: "md" })}
              >
                Build today&apos;s plan <ArrowRight className="size-4" />
              </Link>
            ) : null}
            <TaskFormDialog />
          </div>
        }
      />

      <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-muted">
        <span>{counts.total} total</span>
        <span className="size-1 rounded-full bg-line" aria-hidden />
        <span>{counts.open} open</span>
        <span className="size-1 rounded-full bg-line" aria-hidden />
        <span>{counts.completed} completed</span>
        <span className="size-1 rounded-full bg-line" aria-hidden />
        <span>{counts.mustDoOpen} must-do remaining</span>
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
              Any type
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
                {kindLabels[option]}
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
                title="Your list is empty"
                description="Add the first task. Start with one must-do — something the day genuinely depends on."
                action={<TaskFormDialog />}
                className="border-0 bg-transparent shadow-none"
              />
            ) : (
              <EmptyState
                icon={Search}
                title="No tasks match this view"
                description="Try another status, task type, or search phrase."
                action={
                  <Link href="/tasks" className={buttonVariants({ variant: "outline", size: "sm" })}>
                    Clear filters
                  </Link>
                }
                className="border-0 bg-transparent shadow-none"
              />
            )}
          </Card>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.kind} aria-labelledby={`group-${group.kind}`}>
                <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                  <div>
                    <h2 id={`group-${group.kind}`} className="text-[13px] font-semibold">
                      {kindLabels[group.kind]}
                    </h2>
                    <p className="mt-0.5 text-[11px] text-muted">{kindDescriptions[group.kind]}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-muted">
                    {group.tasks.length} task{group.tasks.length === 1 ? "" : "s"}
                  </span>
                </div>
                <Card className="overflow-hidden">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      timezone={workspace.profile.timezone}
                      planId={plan?.id ?? null}
                      planStatus={plan?.status ?? null}
                      planTask={planTaskByTaskId.get(task.id) ?? null}
                    />
                  ))}
                </Card>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
