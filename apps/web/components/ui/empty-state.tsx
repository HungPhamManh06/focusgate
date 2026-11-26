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
      {/* Minimalist FocusGate arch + horizon SVG art */}
      <svg
        aria-hidden
        viewBox="0 0 180 120"
        className="pointer-events-none absolute -bottom-3 right-1 h-28 w-40 text-accent/25"
        fill="none"
      >
        <circle cx="118" cy="46" r="24" fill="currentColor" fillOpacity="0.18" />
        <path
          d="M78 114V60a40 40 0 0 1 80 0v54"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M92 114V62a26 26 0 0 1 52 0v52"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="2"
          strokeDasharray="4 4"
        />
        <line x1="20" y1="112" x2="170" y2="112" stroke="currentColor" strokeOpacity="0.35" strokeWidth="2" />
        <circle cx="118" cy="46" r="3.5" fill="currentColor" />
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
