"use client";

import { Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import type { ActionState } from "@/lib/actions/types";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function HoldActionButton({
  action,
  label,
  holdingLabel,
  pendingLabel,
  hintLabel,
  holdMs = 1500,
  disabled = false,
  className,
}: {
  action: () => Promise<ActionState>;
  label: string;
  holdingLabel: string;
  pendingLabel: string;
  hintLabel: string;
  holdMs?: number;
  disabled?: boolean;
  className?: string;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const [releasedEarly, setReleasedEarly] = useState(false);
  const [pending, startTransition] = useTransition();
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const toast = useToast();

  const stopHolding = (completed: boolean) => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const wasHolding = startTimeRef.current !== null;
    const elapsed = wasHolding ? performance.now() - (startTimeRef.current ?? 0) : 0;
    startTimeRef.current = null;
    setHolding(false);
    setProgress(0);
    if (!completed && wasHolding && elapsed > 120 && !firedRef.current) {
      setReleasedEarly(true);
    }
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const triggerAction = () => {
    firedRef.current = true;
    stopHolding(true);
    setReleasedEarly(false);
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        navigator.vibrate(35);
      }
    } catch {
      // Ignore vibration API errors.
    }
    startTransition(async () => {
      const result = await action();
      firedRef.current = false;
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  };

  const beginHolding = () => {
    if (disabled || pending || firedRef.current) return;
    setReleasedEarly(false);
    setHolding(true);
    startTimeRef.current = performance.now();

    const step = (now: number) => {
      if (startTimeRef.current === null) return;
      const ratio = Math.min(1, (now - startTimeRef.current) / holdMs);
      setProgress(ratio);
      if (ratio >= 1) {
        triggerAction();
        return;
      }
      rafRef.current = window.requestAnimationFrame(step);
    };
    rafRef.current = window.requestAnimationFrame(step);
  };

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        disabled={disabled || pending}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          beginHolding();
        }}
        onPointerUp={() => stopHolding(false)}
        onPointerLeave={() => stopHolding(false)}
        onPointerCancel={() => stopHolding(false)}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            beginHolding();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            stopHolding(false);
          }
        }}
        className={cn(
          "relative flex h-11 w-full select-none items-center justify-center overflow-hidden rounded-xl border border-accent bg-[#1c1314] px-4 text-[13px] font-semibold text-white shadow-sm transition-transform active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 bg-accent transition-[width] duration-75 ease-linear"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
        <span className="relative z-10 inline-flex items-center gap-2">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {pendingLabel}
            </>
          ) : (
            <>
              <Lock className="size-4" />
              {holding ? `${holdingLabel} (${Math.round(progress * 100)}%)` : label}
            </>
          )}
        </span>
      </button>
      <p
        className={cn(
          "mt-1.5 text-center text-[11px] transition-colors",
          releasedEarly ? "font-medium text-accent" : "text-muted",
        )}
      >
        {hintLabel}
      </p>
    </div>
  );
}
