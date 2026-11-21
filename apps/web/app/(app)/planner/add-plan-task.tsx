"use client";

import { Loader2, Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { addPlanTaskAction } from "@/lib/actions/planner";
import type { Task, TaskKind } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function AddPlanTask({ planId, tasks }: { planId: string; tasks: Task[] }) {
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? "");
  const [kind, setKind] = useState<TaskKind>(tasks[0]?.kind ?? "should_do");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  useEffect(() => {
    if (!tasks.some((task) => task.id === taskId)) {
      setTaskId(tasks[0]?.id ?? "");
    }
  }, [tasks, taskId]);

  function add() {
    const selected = tasks.find((task) => task.id === taskId);
    if (!selected) return;
    startTransition(async () => {
      const result = await addPlanTaskAction({ planId, taskId: selected.id, kind });
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  if (tasks.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        Every open task is already in this plan. Create more from the Tasks screen.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      <Select
        value={taskId}
        onChange={(event) => {
          const nextId = event.target.value;
          setTaskId(nextId);
          const selected = tasks.find((task) => task.id === nextId);
          if (selected) setKind(selected.kind);
        }}
        aria-label="Backlog task"
      >
        {tasks.map((task) => (
          <option key={task.id} value={task.id}>
            {task.title}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Select
          value={kind}
          onChange={(event) => setKind(event.target.value as TaskKind)}
          aria-label="Task type in the plan"
          className="h-9 text-[12px]"
        >
          <option value="must_do">Must-do</option>
          <option value="should_do">Should-do</option>
          <option value="bonus">Bonus</option>
        </Select>
        <Button onClick={add} variant="primary" size="sm" disabled={pending} className="shrink-0">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          Add
        </Button>
      </div>
    </div>
  );
}
