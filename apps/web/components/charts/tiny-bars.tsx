import { cn } from "@/lib/utils";

export function TinyBars({
  values,
  className,
  tone = "accent",
}: {
  values: number[];
  className?: string;
  tone?: "accent" | "muted";
}) {
  const max = Math.max(...values, 1);
  return (
    <div className={cn("flex h-8 items-end gap-1", className)} aria-hidden>
      {values.map((value, index) => (
        <span
          key={index}
          className={cn(
            "w-1.5 rounded-full",
            tone === "accent" ? "bg-accent" : "bg-ink/25",
            value === 0 && "bg-line",
          )}
          style={{ height: value === 0 ? 3 : `${Math.max(18, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}
