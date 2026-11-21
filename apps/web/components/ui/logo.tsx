import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 items-center justify-center rounded-[11px] bg-ink text-canvas",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-[19px]" aria-hidden>
        <path
          d="M5.5 20V10.2a6.5 6.5 0 0 1 13 0V20"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path
          d="M9.4 20v-5.6a2.6 2.6 0 0 1 5.2 0V20"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        />
        <path d="M5.5 20h13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <LogoMark />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-semibold tracking-[-0.02em]">FocusGate</span>
          <span className="mt-1 text-[10px] tracking-[0.08em] text-muted">FOCUS · EARN · UNLOCK</span>
        </span>
      ) : null}
    </span>
  );
}
