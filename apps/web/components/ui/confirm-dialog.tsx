"use client";

import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Button, buttonVariants, type ButtonProps } from "./button";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  eyebrow?: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  pending?: boolean;
  children?: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogAccessibility(open: boolean, onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && dialogRef.current) {
        const nodes = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((node) => node.offsetParent !== null);

        if (nodes.length === 0) {
          event.preventDefault();
          return;
        }

        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        const active = document.activeElement;

        if (event.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  return dialogRef;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  eyebrow,
  description,
  confirmLabel,
  cancelLabel,
  confirmVariant = "accent",
  pending = false,
  children,
}: ConfirmDialogProps) {
  const isVi = useLocale() === "vi";
  const resolvedEyebrow = eyebrow ?? (isVi ? "Xác nhận thao tác" : "Confirm action");
  const resolvedConfirmLabel = confirmLabel ?? (isVi ? "Xác nhận" : "Confirm");
  const resolvedCancelLabel = cancelLabel ?? (isVi ? "Hủy" : "Cancel");
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useDialogAccessibility(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !pending) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-[460px] overflow-hidden rounded-t-[22px] border border-line bg-surface shadow-lift sm:rounded-[22px]"
      >
        <div className="flex items-start justify-between border-b border-line px-6 py-5">
          <div>
            <p className="label-xs flex items-center gap-1.5 text-muted">
              {confirmVariant === "danger" ? (
                <AlertTriangle className="size-3.5 text-danger" aria-hidden />
              ) : null}
              {resolvedEyebrow}
            </p>
            <h2 id={titleId} className="mt-2 font-display text-[26px] leading-none">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label={isVi ? "Đóng hộp thoại" : "Close dialog"}
            className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div id={descriptionId} className="text-[13px] leading-relaxed text-ink-soft">
            {description}
          </div>
          {children}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={buttonVariants({ variant: "ghost", size: "md" })}
          >
            {resolvedCancelLabel}
          </button>
          <Button
            type="button"
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={pending}
            autoFocus
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {resolvedConfirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
