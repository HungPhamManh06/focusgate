"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ToastApi {
  push: (kind: ToastKind, message: string, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider.");
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, action?: ToastAction) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current.slice(-2), { id, kind, message, action }]);
      window.setTimeout(() => remove(id), action ? 5600 : 4800);
    },
    [remove],
  );

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6"
      >
        {toasts.map((toast) => {
          const Icon =
            toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? AlertCircle : Info;
          return (
            <div
              key={toast.id}
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-lift",
                toast.kind === "success" && "border-success/25",
                toast.kind === "error" && "border-danger/25",
                toast.kind === "info" && "border-line",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  toast.kind === "success" && "text-success",
                  toast.kind === "error" && "text-danger",
                  toast.kind === "info" && "text-accent",
                )}
              />
              <p className="flex-1 text-[12.5px] leading-relaxed text-ink-soft">{toast.message}</p>
              {toast.action ? (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    remove(toast.id);
                  }}
                  className="shrink-0 rounded-full border border-accent/35 bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent transition-colors hover:bg-accent hover:text-white"
                >
                  {toast.action.label}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove(toast.id)}
                aria-label="Dismiss notification"
                className="text-muted transition-colors hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
