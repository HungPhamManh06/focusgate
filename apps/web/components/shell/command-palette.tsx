"use client";

import {
  ArrowRight,
  Command,
  History,
  Loader2,
  Maximize2,
  Palette,
  Plus,
  Search,
  Timer,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { useToast } from "@/components/ui/toast";
import {
  filterCommandRoutes,
  parseQuickTaskQuery,
} from "@/lib/domain/command-palette";
import {
  isGateSfxEnabled,
  playGateUnlockSfx,
  playTabSwitchSfx,
  setGateSfxEnabled,
} from "@/lib/domain/gate-sfx";
import { cn } from "@/lib/utils";

const RECENT_KEY = "focusgate:cmd-recent";

interface QuickActionItem {
  id: string;
  labelEn: string;
  labelVi: string;
  keywords: string;
  icon: typeof Timer;
  run: () => void;
}

function applyThemePreset(preset: "crimson" | "espresso" | "matcha" | "nordic") {
  const isDark = preset === "espresso";
  document.documentElement.classList.toggle("dark", isDark);
  if (preset === "matcha" || preset === "nordic") {
    document.documentElement.setAttribute("data-preset", preset);
  } else {
    document.documentElement.removeAttribute("data-preset");
  }
  try {
    window.localStorage.setItem("focusgate-theme", isDark ? "dark" : "light");
    window.localStorage.setItem("focusgate-preset", preset);
    window.localStorage.setItem("focusgate-auto-sunset", "0");
  } catch {
    // ignore
  }
}

export function CommandPalette() {
  const isVi = useLocale() === "vi";
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const [compactWindow, setCompactWindow] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentCmds, setRecentCmds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const pushRecent = useCallback((label: string) => {
    setRecentCmds((prev) => {
      const next = [label, ...prev.filter((x) => x !== label)].slice(0, 5);
      try {
        window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setSfxEnabled(isGateSfxEnabled());
    try {
      setCompactWindow(window.localStorage.getItem("focusgate-compact-window") === "1");
      const saved = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]") as string[];
      if (Array.isArray(saved)) setRecentCmds(saved.slice(0, 5));
    } catch {
      // ignore
    }
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
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [open]);

  const toggleSfx = useCallback(() => {
    setSfxEnabled((prev) => {
      const next = !prev;
      setGateSfxEnabled(next);
      if (next) playGateUnlockSfx();
      toast.push(
        "success",
        next
          ? isVi
            ? "Đã bật âm thanh nghi thức & phản hồi."
            : "Gate & tactile sounds enabled."
          : isVi
            ? "Đã tắt âm thanh phản hồi."
            : "Sound effects muted.",
      );
      return next;
    });
  }, [isVi, toast]);

  const toggleCompact = useCallback(() => {
    setCompactWindow((prev) => {
      const next = !prev;
      if (next) document.documentElement.setAttribute("data-compact-window", "1");
      else document.documentElement.removeAttribute("data-compact-window");
      try {
        window.localStorage.setItem("focusgate-compact-window", next ? "1" : "0");
      } catch {
        // ignore
      }
      toast.push(
        "success",
        next
          ? isVi
            ? "Đã bật chế độ Cửa sổ Thu gọn."
            : "Compact Side-Window mode enabled."
          : isVi
            ? "Đã tắt chế độ Cửa sổ Thu gọn."
            : "Compact Side-Window mode disabled.",
      );
      return next;
    });
  }, [isVi, toast]);

  const quickActions = useMemo<QuickActionItem[]>(
    () => [
      {
        id: "act-focus-25",
        labelEn: "Start Focus Sprint (25m)",
        labelVi: "Bắt đầu phiên Tập trung (25p)",
        keywords: "focus 25 sprint timer start",
        icon: Timer,
        run: () => {
          pushRecent("focus 25");
          playTabSwitchSfx();
          setOpen(false);
          router.push("/focus");
        },
      },
      {
        id: "act-theme-crimson",
        labelEn: "Theme: Crimson Editorial",
        labelVi: "Giao diện: Giấy Ấm & Đỏ Thẫm",
        keywords: "theme crimson light paper",
        icon: Palette,
        run: () => {
          applyThemePreset("crimson");
          pushRecent("theme crimson");
          playTabSwitchSfx();
          setOpen(false);
        },
      },
      {
        id: "act-theme-espresso",
        labelEn: "Theme: Midnight Espresso",
        labelVi: "Giao diện: Espresso Đêm Đỏ",
        keywords: "theme espresso dark night",
        icon: Palette,
        run: () => {
          applyThemePreset("espresso");
          pushRecent("theme espresso");
          playTabSwitchSfx();
          setOpen(false);
        },
      },
      {
        id: "act-theme-matcha",
        labelEn: "Theme: Kyoto Matcha",
        labelVi: "Giao diện: Trà Đạo Kyoto",
        keywords: "theme matcha green kyoto",
        icon: Palette,
        run: () => {
          applyThemePreset("matcha");
          pushRecent("theme matcha");
          playTabSwitchSfx();
          setOpen(false);
        },
      },
      {
        id: "act-theme-nordic",
        labelEn: "Theme: Nordic Slate",
        labelVi: "Giao diện: Bắc Âu Tối Giản",
        keywords: "theme nordic blue slate",
        icon: Palette,
        run: () => {
          applyThemePreset("nordic");
          pushRecent("theme nordic");
          playTabSwitchSfx();
          setOpen(false);
        },
      },
      {
        id: "act-compact",
        labelEn: compactWindow ? "Disable Compact Side-Window" : "Enable Compact Side-Window",
        labelVi: compactWindow ? "Tắt chế độ Cửa sổ Thu gọn" : "Bật chế độ Cửa sổ Thu gọn",
        keywords: "compact window mini side mode",
        icon: Maximize2,
        run: () => {
          toggleCompact();
          pushRecent("compact");
          setOpen(false);
        },
      },
    ],
    [compactWindow, pushRecent, router, toggleCompact],
  );

  const matchingActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return quickActions.slice(0, 3);
    return quickActions.filter(
      (a) =>
        a.keywords.includes(q) ||
        a.labelEn.toLowerCase().includes(q) ||
        a.labelVi.toLowerCase().includes(q),
    );
  }, [query, quickActions]);

  const matchingRoutes = useMemo(() => filterCommandRoutes(query), [query]);
  const quickTask = useMemo(() => parseQuickTaskQuery(query), [query]);

  const flatSelectable = useMemo(() => {
    const list: Array<{ key: string; run: () => void }> = [];
    for (const act of matchingActions) {
      list.push({ key: act.id, run: act.run });
    }
    for (const route of matchingRoutes) {
      list.push({
        key: route.id,
        run: () => {
          pushRecent(isVi ? route.labelVi : route.labelEn);
          playTabSwitchSfx();
          setOpen(false);
          router.push(route.href);
        },
      });
    }
    return list;
  }, [matchingActions, matchingRoutes, isVi, pushRecent, router]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

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
      pushRecent(`+ ${quickTask.title}`);
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

  function handleKeyNavigation(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (flatSelectable.length > 0) {
        setActiveIndex((prev) => (prev + 1) % flatSelectable.length);
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (flatSelectable.length > 0) {
        setActiveIndex((prev) => (prev - 1 + flatSelectable.length) % flatSelectable.length);
      }
    }
  }

  return (
    <>
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
          className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 px-4 pt-[11vh] backdrop-blur-xs"
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
                const isExplicitTask =
                  query.trim().startsWith("+") ||
                  query.trim().startsWith("*") ||
                  query.trim().startsWith("!");
                if (!isExplicitTask && flatSelectable[activeIndex]) {
                  flatSelectable[activeIndex].run();
                  return;
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
                onKeyDown={handleKeyNavigation}
                placeholder={
                  isVi
                    ? "Gõ `theme matcha`, `focus 25`, `compact`, hoặc `+ Tên việc`…"
                    : "Type `theme matcha`, `focus 25`, `compact`, or `+ Task title`…"
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

            <div className="max-h-[400px] overflow-y-auto p-2">
              {!query.trim() && recentCmds.length > 0 ? (
                <div className="mb-2 flex flex-wrap items-center gap-1.5 px-2 pt-1">
                  <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                    <History className="size-3" />
                    {isVi ? "Gần đây:" : "Recent:"}
                  </span>
                  {recentCmds.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => setQuery(cmd)}
                      className="rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[11px] text-ink-soft hover:border-accent/40 hover:text-ink"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              ) : null}

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

              {matchingActions.length > 0 ? (
                <div className="mt-2">
                  <p className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {isVi ? "Lệnh tức thì" : "Instant actions"}
                  </p>
                  <div className="space-y-0.5">
                    {matchingActions.map((act, idx) => {
                      const Icon = act.icon;
                      const isActive = activeIndex === idx;
                      return (
                        <button
                          key={act.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={act.run}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] transition-colors",
                            isActive
                              ? "bg-accent-soft/70 font-medium text-ink"
                              : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <Icon className="size-3.5 text-accent" />
                            {isVi ? act.labelVi : act.labelEn}
                          </span>
                          <ArrowRight className="size-3.5 text-muted" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {matchingRoutes.length > 0 ? (
                <div className="mt-2">
                  <p className="px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {isVi ? "Điều hướng nhanh" : "Quick navigation"}
                  </p>
                  <div className="space-y-0.5">
                    {matchingRoutes.map((route, idx) => {
                      const flatIdx = matchingActions.length + idx;
                      const isActive = activeIndex === flatIdx;
                      return (
                        <button
                          key={route.id}
                          type="button"
                          onMouseEnter={() => setActiveIndex(flatIdx)}
                          onClick={() => {
                            pushRecent(isVi ? route.labelVi : route.labelEn);
                            playTabSwitchSfx();
                            setOpen(false);
                            router.push(route.href);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-xl px-3 py-2 text-[13px] transition-colors",
                            isActive
                              ? "bg-accent-soft/70 font-medium text-ink"
                              : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                          )}
                        >
                          <span>{isVi ? route.labelVi : route.labelEn}</span>
                          <ArrowRight className="size-3.5 text-muted" />
                        </button>
                      );
                    })}
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
                    {isVi ? "Âm thanh nghi thức & phản hồi" : "Ritual & tactile sound effects"}
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
