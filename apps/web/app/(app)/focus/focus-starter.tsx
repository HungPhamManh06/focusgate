"use client";

import { Loader2, Play } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { startFocusAction } from "@/lib/actions/focus";
import type { FocusCandidate } from "@/lib/data/focus";
import { formatMinutes } from "@/lib/data/format";
import type { FocusMode } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const presets: { mode: FocusMode; label: string; minutes: number; hint: string }[] = [
  { mode: "pomodoro_25_5", label: "Quick block", minutes: 25, hint: "25 focus · 5 rest" },
  { mode: "pomodoro_50_10", label: "Deep block", minutes: 50, hint: "50 focus · 10 rest" },
];

export function FocusStarter({
  candidates,
  minValidMinutes,
}: {
  candidates: FocusCandidate[];
  minValidMinutes: number;
}) {
  const [taskId, setTaskId] = useState(() => {
    const planned = candidates.find((candidate) => candidate.inTodayPlan);
    return planned?.id ?? candidates[0]?.id ?? "";
  });
  const [mode, setMode] = useState<FocusMode>("pomodoro_25_5");
  const [customMinutes, setCustomMinutes] = useState(30);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const selectedTask = useMemo(
    () => candidates.find((candidate) => candidate.id === taskId),
    [candidates, taskId],
  );

  function start() {
    const minutes = mode === "custom" ? customMinutes : (presets.find((preset) => preset.mode === mode)?.minutes ?? 25);
    startTransition(async () => {
      const result = await startFocusAction({
        taskId: taskId || null,
        mode,
        minutes,
      });
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  return (
    <div className="surface-card">
      <div className="border-b border-line px-5 py-5 sm:px-7">
        <p className="label-xs text-muted">New session</p>
        <h2 className="mt-2 font-display text-[28px] leading-none tracking-[-0.01em]">
          Start a focus block.
        </h2>
        <p className="mt-2 text-[12px] leading-relaxed text-muted">
          Pick one task. Keep the block honest. Valid focus is computed from the session clock.
        </p>
      </div>

      <div className="space-y-6 px-5 py-6 sm:px-7">
        <div>
          <label htmlFor="focus-task" className="mb-1.5 block text-[12px] font-medium text-ink-soft">
            What are you focusing on?
          </label>
          <Select
            id="focus-task"
            value={taskId}
            onChange={(event) => setTaskId(event.target.value)}
          >
            <option value="">Free focus — no task</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.inTodayPlan ? "Today · " : ""}
                {candidate.title}
              </option>
            ))}
          </Select>
          {selectedTask ? (
            <p className="mt-1.5 text-[11px] text-muted">
              {selectedTask.requiredFocusMinutes > 0
                ? `${selectedTask.requiredFocusMinutes} verified minutes needed for this task`
                : "No focus requirement for this task"}
              {selectedTask.inTodayPlan ? " · part of today's plan" : " · not in today's plan"}
            </p>
          ) : (
            <p className="mt-1.5 text-[11px] text-muted">
              Free focus still counts toward your daily focus total, but not toward a plan task.
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-[12px] font-medium text-ink-soft">Session length</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {presets.map((preset) => (
              <button
                key={preset.mode}
                type="button"
                onClick={() => setMode(preset.mode)}
                className={cn(
                  "rounded-xl border px-3.5 py-3 text-left transition-colors",
                  mode === preset.mode
                    ? "border-accent/40 bg-accent-soft/70"
                    : "border-line bg-surface-2/40 hover:border-line hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "text-[12.5px] font-medium",
                    mode === preset.mode && "text-accent",
                  )}
                >
                  {preset.label}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-muted">{preset.hint}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMode("custom")}
              className={cn(
                "rounded-xl border px-3.5 py-3 text-left transition-colors",
                mode === "custom"
                  ? "border-accent/40 bg-accent-soft/70"
                  : "border-line bg-surface-2/40 hover:bg-surface-2",
              )}
            >
              <span className={cn("text-[12.5px] font-medium", mode === "custom" && "text-accent")}>
                Custom
              </span>
              <span className="mt-0.5 block text-[10.5px] text-muted">
                {mode === "custom" ? `${customMinutes} min` : "Set your own"}
              </span>
            </button>
          </div>

          {mode === "custom" ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={180}
                step={5}
                value={customMinutes}
                onChange={(event) => setCustomMinutes(Number(event.target.value))}
                aria-label="Custom session minutes"
                className="h-9 w-24 rounded-lg border border-line bg-surface px-3 text-[12px] focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10"
              />
              <span className="text-[11px] text-muted">minutes (5–180)</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button onClick={start} disabled={pending} variant="accent" size="lg">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Start focus
          </Button>
          <p className="text-[10.5px] leading-relaxed text-muted">
            Sessions shorter than {formatMinutes(minValidMinutes)} are saved but marked invalid.
          </p>
        </div>
      </div>
    </div>
  );
}
