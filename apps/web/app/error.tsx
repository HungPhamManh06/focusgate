"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-danger-soft text-danger">
        <AlertTriangle className="size-5" strokeWidth={1.8} />
      </span>
      <p className="label-xs mt-6 text-muted">Application error</p>
      <h1 className="mt-3 font-display text-[34px] leading-tight tracking-[-0.01em]">
        FocusGate could not load.
      </h1>
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {error.message || "An unexpected server error occurred."}
      </p>
      <div className="mt-7 flex items-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" /> Try again
        </Button>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-full border border-line bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-2"
          >
            Sign out
          </button>
        </form>
      </div>
      {error.digest ? <p className="mt-6 text-[10.5px] text-muted">Reference: {error.digest}</p> : null}
    </div>
  );
}
