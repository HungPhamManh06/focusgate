"use client";

import { AlertTriangle, Loader2, Play } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { startFocusAction } from "@/lib/actions/focus";
import type { FocusCandidate } from "@/lib/data/focus";
import { formatMinutes } from "@/lib/data/format";
import type { FocusMode } from "@/lib/data/types";
import { evaluateFocusStarterOptions } from "@/lib/domain/focus-timer-state";
import { validatePlannedDurationAgainstMinValid } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function FocusStarter({
  candidates,
  minValidMinutes,
}: {
  candidates: FocusCandidate[];
  minValidMinutes: number;
}) {
  const starterConfig = useMemo(
    () => evaluateFocusStarterOptions(minValidMinutes),
    [minValidMinutes],
  );

  const [taskId, setTaskId] = useState(() => {
    const planned = candidates.find((candidate) => candidate.inTodayPlan);
    return planned?.id ?? candidates[0]?.id ?? "";
  });

  const [mode, setMode] = useState<FocusMode>(() => {
    const firstValidPreset = starterConfig.presets.find((preset) => !preset.disabled);
    return firstValidPreset ? firstValidPreset.mode : "custom";
  });

  const [customMinutes, setCustomMinutes] = useState(() =>
    Math.max(30, starterConfig.minAllowedCustomMinutes),
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  // If `minValidMinutes` changes and the currently selected preset becomes disabled,
  // switch the selection to the next available valid preset or `custom` explicitly
  // without silently mutating `customMinutes` behind the user's back.
  useEffect(() => {
    if (mode !== "custom") {
      const activePreset = starterConfig.presets.find((preset) => preset.mode === mode);
      if (activePreset?.disabled) {
        const fallbackPreset = starterConfig.presets.find((preset) => !preset.disabled);
        setMode(fallbackPreset ? fallbackPreset.mode : "custom");
      }
    }
  }, [mode, starterConfig]);

  const selectedTask = useMemo(
    () => candidates.find((candidate) => candidate.id === taskId),
    [candidates, taskId],
  );

  const selectedPlannedMinutes = useMemo(() => {
    if (mode === "custom") return customMinutes;
    return starterConfig.presets.find((preset) => preset.mode === mode)?.minutes ?? 25;
  }, [customMinutes, mode, starterConfig.presets]);

  const durationCheck = useMemo(() => {
    if (!Number.isFinite(selectedPlannedMinutes) || selectedPlannedMinutes < 5) {
      return {
        valid: false as const,
        minPlannedMinutes: starterConfig.minAllowedCustomMinutes,
        error: `Enter a duration between ${starterConfig.minAllowedCustomMinutes} and 180 minutes.`,
      };
    }
    if (selectedPlannedMinutes > 180) {
      return {
        valid: false as const,
        minPlannedMinutes: starterConfig.minAllowedCustomMinutes,
        error: "Keep custom sessions at or under 180 minutes.",
      };
    }
    return validatePlannedDurationAgainstMinValid({
      plannedMinutes: selectedPlannedMinutes,
      minValidFocusMinutes: starterConfig.minValidMinutes,
    });
  }, [
    selectedPlannedMinutes,
    starterConfig.minAllowedCustomMinutes,
    starterConfig.minValidMinutes,
  ]);

  function start() {
    if (!durationCheck.valid) {
      setValidationError(durationCheck.error);
      toast.push("error", durationCheck.error);
      return;
    }
    setValidationError(null);

    startTransition(async () => {
      const result = await startFocusAction({
        taskId: taskId || null,
        mode,
        minutes: selectedPlannedMinutes,
      });
      if (result.error) {
        setValidationError(result.error);
        toast.push("error", result.error);
      } else if (result.success) {
        toast.push("success", result.success);
      }
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
          Pick one task. Keep the block honest. Valid focus is computed from the server clock and
          locks your current {formatMinutes(starterConfig.minValidMinutes)} minimum threshold when
          started.
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
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-medium text-ink-soft">Session length</p>
            <p className="text-[11px] text-muted tabular-nums">
              Minimum valid session: {formatMinutes(starterConfig.minValidMinutes)} (requires ≥{" "}
              {formatMinutes(starterConfig.minAllowedCustomMinutes)} planned)
            </p>
          </div>

          {!starterConfig.anyPresetAvailable ? (
            <div
              role="note"
              className="mb-3 flex items-start gap-2.5 rounded-xl border border-warning/35 bg-warning-soft/80 px-3.5 py-2.5 text-[11.5px] text-ink"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              <div>
                <p className="font-semibold">
                  Standard presets are shorter than your {formatMinutes(starterConfig.minValidMinutes)}{" "}
                  minimum valid threshold
                </p>
                <p className="mt-0.5 text-ink-soft">
                  Because focus credit is capped at 2× the planned duration, select a Custom
                  session of at least{" "}
                  <span className="font-semibold text-ink">
                    {formatMinutes(starterConfig.minAllowedCustomMinutes)}
                  </span>{" "}
                   below.
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Session length presets">
            {starterConfig.presets.map((preset) => (
              <button
                key={preset.mode}
                type="button"
                disabled={preset.disabled}
                aria-disabled={preset.disabled}
                aria-pressed={mode === preset.mode}
                onClick={() => {
                  if (preset.disabled) return;
                  setMode(preset.mode);
                  setValidationError(null);
                }}
                className={cn(
                  "rounded-xl border px-3.5 py-3 text-left transition-colors",
                  preset.disabled
                    ? "cursor-not-allowed border-line/70 bg-surface-2/25 opacity-60"
                    : mode === preset.mode
                      ? "border-accent/40 bg-accent-soft/70"
                      : "border-line bg-surface-2/40 hover:border-line hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "text-[12.5px] font-medium",
                    !preset.disabled && mode === preset.mode && "text-accent",
                  )}
                >
                  {preset.label}
                </span>
                <span className="mt-0.5 block text-[10.5px] text-muted">{preset.hint}</span>
                {preset.disabledReason ? (
                  <span className="mt-1.5 block text-[10px] leading-snug text-warning">
                    {preset.disabledReason}
                  </span>
                ) : null}
              </button>
            ))}

            <button
              type="button"
              aria-pressed={mode === "custom"}
              onClick={() => {
                setMode("custom");
                setValidationError(null);
              }}
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
                {mode === "custom"
                  ? `${customMinutes} min (max ${customMinutes * 2}m credit)`
                  : `Min ${starterConfig.minAllowedCustomMinutes} min`}
              </span>
            </button>
          </div>

          {mode === "custom" ? (
            <div className="mt-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={starterConfig.minAllowedCustomMinutes}
                  max={180}
                  step={5}
                  value={customMinutes}
                  onChange={(event) => {
                    setCustomMinutes(Number(event.target.value));
                    setValidationError(null);
                  }}
                  aria-label="Custom session minutes"
                  aria-invalid={!durationCheck.valid}
                  className={cn(
                    "h-9 w-24 rounded-lg border bg-surface px-3 text-[12px] tabular-nums focus:outline-none focus:ring-4",
                    !durationCheck.valid
                      ? "border-danger focus:border-danger focus:ring-danger/10"
                      : "border-line focus:border-accent focus:ring-accent/10",
                  )}
                />
                <span className="text-[11px] text-muted tabular-nums">
                  minutes ({starterConfig.minAllowedCustomMinutes}–180 · max{" "}
                  {Math.max(0, customMinutes * 2)}m credit)
                </span>
              </div>
              {!durationCheck.valid ? (
                <p role="alert" className="text-[11px] font-medium text-danger">
                  {durationCheck.error}
                </p>
              ) : null}
            </div>
          ) : null}

          {validationError && durationCheck.valid ? (
            <p role="alert" className="mt-2 text-[11px] font-medium text-danger">
              {validationError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <Button
            onClick={start}
            disabled={pending || !durationCheck.valid}
            variant="accent"
            size="lg"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            Start focus
          </Button>
          <p className="text-[10.5px] leading-relaxed text-muted">
            Sessions shorter than {formatMinutes(starterConfig.minValidMinutes)} are saved to
            history with 0m credit. Maximum credit per session is{" "}
            {formatMinutes(selectedPlannedMinutes * 2)} (2× planned).
          </p>
        </div>
      </div>
    </div>
  );
}
