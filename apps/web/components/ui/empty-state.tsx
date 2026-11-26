import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col items-start gap-4 overflow-hidden rounded-[18px] border border-dashed border-line bg-surface/60 px-6 py-10 sm:px-8",
        className,
      )}
    >
      {/* Subtle FocusGate arch watermark */}
      <svg
        aria-hidden
        viewBox="0 0 120 120"
        className="pointer-events-none absolute -bottom-4 -right-2 size-32 text-line/45"
        fill="none"
      >
        <path
          d="M24 112V58a36 36 0 0 1 72 0v54"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
        />
        <circle cx="60" cy="40" r="4" fill="currentColor" />
      </svg>

      <span className="relative z-10 flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <div className="relative z-10 max-w-md">
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {action ? <div className="relative z-10 pt-1">{action}</div> : null}
    </div>
  );
}
