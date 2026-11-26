import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-line/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8 lg:px-10">
      {/* Greeting + Compact Metric Strip */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-10 w-64 sm:w-80" />
          <Skeleton className="h-4 w-72 sm:w-96" />
        </div>
        <Skeleton className="h-[68px] w-full rounded-2xl lg:w-[390px]" />
      </div>

      {/* Day Timeline Ribbon */}
      <Skeleton className="mt-5 h-[72px] w-full rounded-2xl" />

      {/* Hero Bento Stage */}
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.95fr)_minmax(340px,1fr)]">
        <Skeleton className="h-[420px] rounded-[18px]" />
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[220px] rounded-[18px]" />
          <Skeleton className="h-[180px] rounded-[18px]" />
        </div>
      </div>

      {/* Bottom 2-Column Activity + Coach */}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-[240px] rounded-[18px]" />
        <Skeleton className="h-[240px] rounded-[18px]" />
      </div>
    </div>
  );
}
