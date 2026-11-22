import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-line/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-7 sm:px-8 sm:py-9">
      <Skeleton className="h-3 w-28" />
      <Skeleton className="mt-4 h-11 w-2/3 max-w-[420px]" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-[340px]" />
      <div className="mt-7 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[118px] rounded-[18px]" />
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.95fr)_minmax(320px,1fr)]">
        <Skeleton className="h-[380px] rounded-[18px]" />
        <Skeleton className="h-[380px] rounded-[18px]" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-[260px] rounded-[18px]" />
        <Skeleton className="h-[260px] rounded-[18px]" />
      </div>
    </div>
  );
}
