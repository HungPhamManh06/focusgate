import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-line/70", className)} />;
}

export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1180px] px-5 py-8 sm:px-8 sm:py-10">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-11 w-2/3 max-w-[420px]" />
      <Skeleton className="mt-3 h-4 w-1/2 max-w-[320px]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[118px] rounded-[18px]" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-[18px] lg:col-span-2" />
        <Skeleton className="h-[320px] rounded-[18px]" />
      </div>
    </div>
  );
}
