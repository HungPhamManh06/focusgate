"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isVi = useLocale() === "vi";
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-5" strokeWidth={1.8} />
      </span>
      <p className="label-xs mt-6 text-muted">{isVi ? "Đã xảy ra sự cố" : "Something broke"}</p>
      <h1 className="mt-3 font-display text-[34px] leading-tight tracking-[-0.01em]">
        {isVi ? "Không thể tải màn hình này." : "This screen could not load."}
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {error.message ||
          (isVi
            ? "Không gian làm việc gặp lỗi không mong muốn."
            : "The local workspace ran into an unexpected error.")}
      </p>
      <div className="mt-7 flex items-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" /> {isVi ? "Thử lại" : "Try again"}
        </Button>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2"
        >
          {isVi ? "Về Tổng quan" : "Back to dashboard"}
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-6 text-[10.5px] text-muted">
          {isVi ? "Mã tham chiếu:" : "Reference:"} {error.digest}
        </p>
      ) : null}
    </div>
  );
}
