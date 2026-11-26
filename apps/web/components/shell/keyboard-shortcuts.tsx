"use client";

import { Keyboard, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

const GO_ROUTES: Array<{
  key: string;
  href: string;
  label: string;
  labelVi: string;
}> = [
  { key: "d", href: "/", label: "Dashboard", labelVi: "Tổng quan" },
  { key: "t", href: "/tasks", label: "Tasks", labelVi: "Nhiệm vụ" },
  { key: "p", href: "/planner", label: "Planner", labelVi: "Kế hoạch" },
  { key: "f", href: "/focus", label: "Focus Studio", labelVi: "Tập trung" },
  { key: "w", href: "/wallet", label: "Reward Wallet", labelVi: "Ví thưởng" },
  { key: "s", href: "/statistics", label: "Statistics", labelVi: "Thống kê" },
  { key: "v", href: "/devices", label: "Devices & Rules", labelVi: "Thiết bị & Chặn" },
  { key: ",", href: "/settings", label: "Settings", labelVi: "Cài đặt" },
];

const GENERAL_SHORTCUTS = [
  { keys: ["Ctrl", "K"], labelEn: "Command Palette 2.0", labelVi: "Bảng lệnh nhanh 2.0" },
  { keys: ["?"], labelEn: "Toggle Shortcut Cheatsheet", labelVi: "Mở / Đóng bảng phím tắt" },
  { keys: ["F"], labelEn: "Fullscreen Focus Sanctuary", labelVi: "Buồng lái tập trung toàn MH" },
  { keys: ["Esc"], labelEn: "Exit Modal / Studio / Desk Clock", labelVi: "Thoát Hộp thoại / Studio" },
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

function Keycap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-line border-b-2 bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase text-ink shadow-xs">
      {children}
    </kbd>
  );
}

export function KeyboardShortcuts() {
  const router = useRouter();
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const gPressedAtRef = useRef<number>(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "Escape" && open) {
        setOpen(false);
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      const lower = e.key.toLowerCase();
      const now = Date.now();
      if (lower === "g") {
        gPressedAtRef.current = now;
        return;
      }

      if (gPressedAtRef.current > 0 && now - gPressedAtRef.current < 900) {
        const match = GO_ROUTES.find((r) => r.key === lower);
        gPressedAtRef.current = 0;
        if (match) {
          e.preventDefault();
          setOpen(false);
          router.push(match.href);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  const q = filter.trim().toLowerCase();
  const filteredRoutes = useMemo(
    () =>
      GO_ROUTES.filter(
        (r) => !q || r.label.toLowerCase().includes(q) || r.labelVi.toLowerCase().includes(q) || r.key === q,
      ),
    [q],
  );
  const filteredGeneral = useMemo(
    () =>
      GENERAL_SHORTCUTS.filter(
        (g) => !q || g.labelEn.toLowerCase().includes(q) || g.labelVi.toLowerCase().includes(q),
      ),
    [q],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={isVi ? "Bảng phím tắt" : "Keyboard shortcuts"}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="fg-animate-in w-full max-w-xl rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="size-4 text-accent" />
            <h2 className="text-[15px] font-semibold text-ink">
              {isVi ? "Bảng Phím tắt Trực quan 2.0" : "Visual Keycap Shortcuts 2.0"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={isVi ? "Đóng" : "Close"}
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="border-b border-line px-5 py-2.5">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-1.5">
            <Search className="size-3.5 text-muted" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={isVi ? "Tìm phím tắt…" : "Filter shortcuts…"}
              className="w-full bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              {isVi ? "Điều hướng (G + phím)" : "Navigation (G then key)"}
            </p>
            <ul className="space-y-2 text-[12.5px]">
              {filteredRoutes.map((item) => (
                <li key={item.href} className="flex items-center justify-between">
                  <span className="text-ink-soft">{isVi ? item.labelVi : item.label}</span>
                  <span className="flex items-center gap-1">
                    <Keycap>G</Keycap>
                    <Keycap>{item.key}</Keycap>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              {isVi ? "Tập trung & Hệ thống" : "Focus & System"}
            </p>
            <ul className="space-y-2.5 text-[12.5px]">
              {filteredGeneral.map((g) => (
                <li key={g.labelEn} className="flex items-center justify-between gap-2">
                  <span className="text-ink-soft">{isVi ? g.labelVi : g.labelEn}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {g.keys.map((k) => (
                      <Keycap key={k}>{k}</Keycap>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
