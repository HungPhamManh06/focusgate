import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "accent" | "success" | "warning";
  className?: string;
}) {
  const toneClasses = {
    default: "bg-surface-2 text-ink-soft",
    accent: "bg-accent-soft text-accent",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-warning",
  } as const;

  return (
    <div className={cn("surface-card p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="label-xs text-muted">{label}</p>
        {Icon ? (
          <span className={cn("flex size-7 items-center justify-center rounded-lg", toneClasses[tone])}>
            <Icon className="size-3.5" strokeWidth={1.9} />
          </span>
        ) : null}
      </div>
      <p className="mt-4 font-display text-[34px] leading-none tracking-[-0.02em]">{value}</p>
      {hint ? <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">{hint}</p> : null}
    </div>
  );
}
