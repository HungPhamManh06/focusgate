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
        "flex flex-col items-start gap-4 rounded-[18px] border border-dashed border-line bg-surface/60 px-6 py-10 sm:px-8",
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <div className="max-w-md">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{description}</p>
      </div>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
