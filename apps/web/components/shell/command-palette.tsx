"use client";

import { ArrowRight, Command, Loader2, Plus, Search, Volume2, VolumeX, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { useToast } from "@/components/ui/toast";
import {
  filterCommandRoutes,
  parseQuickTaskQuery,
} from "@/lib/domain/command-palette";
import {
  isGateSfxEnabled,
  playGateUnlockSfx,
  setGateSfxEnabled,
} from "@/lib/domain/gate-sfx";

export function CommandPalette() {
  const isVi = useLocale() === "vi";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSfxEnabled(isGateSfxEnabled());
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [open]);

  const matchingRoutes = useMemo(() => filterCommandRoutes(query), [query]);
  const quickTask = useMemo(() => parseQuickTaskQuery(query), [query]);

  async function createQuickTask() {
    if (!quickTask || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/agent/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickTask.title,
          kind: quickTask.kind,
          requiredFocusMinutes: 0,
          addToTodayPlan: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; addedToPlan?: boolean };
      if (!res.ok) {
        throw new Error(data.error || (isVi ? "Không thể tạo nhiệm vụ." : "Could not create task."));
      }
      toast.push(
        "success",
        data.addedToPlan
          ? isVi
            ? `Đã thêm "${quickTask.title}" vào kế hoạch hôm nay.`
            : `Added "${quickTask.title}" to today's plan.`
          : isVi
            ? `Đã lưu "${quickTask.title}" vào danh sách nhiệm vụ.`
            : `Saved "${quickTask.title}" to your task list.`,
      );
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast.push(
        "error",
        error instanceof Error ? error.message : isVi ? "Có lỗi xảy ra." : "Something went wrong.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function toggleSfx() {
    const next = !sfxEnabled;
    setSfxEnabled(next);
    setGateSfxEnabled(next);
    if (next) playGateUnlockSfx();
    toast.push(
      "success",
      next
        ? isVi
          ? "Đã bật âm thanh nghi thức Khóa/Mở cổng."
          : "Gate ritual sound effects enabled."
        : isVi
          ? "Đã tắt âm thanh nghi thức."
          : "Gate ritual sound effects muted.",
    );
  }

  return (
    <>
      {/* Subtle Desktop Shortcut Pill */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={isVi ? "Mở bảng lệnh nhanh (Ctrl+K)" : "Open quick command palette (Ctrl+K)"}
        className="fixed bottom-5 right-5 z-40 hidden items-center gap-2 rounded-full border border-line bg-surface/90 px-3.5 py-2 text-[11.5px] font-medium text-ink-soft shadow-lift backdrop-blur-md transition-colors hover:border-accent/40 hover:text-ink lg:inline-flex"
      >
        <Command className="size-3.5 text-accent" />
        <span>{isVi ? "Lệnh nhanh" : "Quick command"}</span>
        <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-[10px] text-muted">
          Ctrl K
        </kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={isVi ? "Bảng lệnh nhanh FocusGate" : "FocusGate command palette"}
            className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (matchingRoutes.length > 0 && !query.trim().startsWith("+") && !query.trim().startsWith("*") && !query.trim().startsWith("!")) {
                  const first = matchingRoutes[0];
                  if (first) {
                    setOpen(false);
                    router.push(first.href);
                    return;
                  }
                }
                void createQuickTask();
              }}
              className="flex items-center gap-2.5 border-b border-line px-4 py-3"
            >
              <Search className="size-4 shrink-0 text-muted" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  isVi
                    ? "Tìm trang hoặc gõ `+ Tên việc` để thêm ngay vào hôm nay…"
                    : "Jump to page or type `+ Task title` to add to today…"
                }
                className="w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink"
                aria-label={isVi ? "Đóng" : "Close"}
              >
                <X className="size-4" />
              </button>
            </form>

            <div className="max-h-[360px] overflow-y-auto p-2">
              {quickTask ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void createQuickTask()}
                  className="flex w-full items-center justify-between gap-3 rounded-xl border border-accent/25 bg-accent-soft/50 px-3 py-2.5 text-left text-[13px] font-medium text-ink transition-colors hover:bg-accent-soft"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {submitting ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-accent" />
                    ) : (
                      <Plus className="size-4 shrink-0 text-accent" />
                    )}
                    <span className="truncate">
                      {isVi
                        ? `Thêm vào hôm nay: "${quickTask.title}"`
                        : `Add to today: "${quickTask.title}"`}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-surface px-2 py-0.5 text-[10.5px] text-accent">
                    {quickTask.kind === "bonus"
                      ? isVi ? "Thưởng" : "Bonus"
                      : isVi ? "Bắt buộc" : "Must-do"}
                  </span>
                </button>
              ) : null}

              {matchingRoutes.length > 0 ? (
                <div className="mt-2">
                  <p className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {isVi ? "Điều hướng nhanh" : "Quick navigation"}
                  </p>
                  <div className="space-y-0.5">
                    {matchingRoutes.map((route) => (
                      <button
                        key={route.id}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          router.push(route.href);
                        }}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                      >
                        <span>{isVi ? route.labelVi : route.labelEn}</span>
                        <ArrowRight className="size-3.5 text-muted" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-2 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={toggleSfx}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[12.5px] text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <span className="flex items-center gap-2">
                    {sfxEnabled ? (
                      <Volume2 className="size-3.5 text-accent" />
                    ) : (
                      <VolumeX className="size-3.5 text-muted" />
                    )}
                    {isVi ? "Âm thanh nghi thức Khóa/Mở cổng" : "Gate lock/unlock ritual sounds"}
                  </span>
                  <span className="text-[11px] font-medium text-muted">
                    {sfxEnabled ? (isVi ? "Đang bật" : "On") : isVi ? "Đang tắt" : "Off"}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
