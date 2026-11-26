"use client";

import { Keyboard, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

export function KeyboardShortcuts() {
  const router = useRouter();
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
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
      <div className="fg-animate-in w-full max-w-lg rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="size-4 text-accent" />
            <h2 className="text-[15px] font-semibold text-ink">
              {isVi ? "Phím tắt điều hướng nhanh" : "Keyboard Shortcuts"}
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

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              {isVi ? "Điều hướng (Nhấn G rồi phím)" : "Go to (Press G then key)"}
            </p>
            <ul className="space-y-2 text-[12.5px]">
              {GO_ROUTES.map((item) => (
                <li key={item.href} className="flex items-center justify-between">
                  <span className="text-ink-soft">{isVi ? item.labelVi : item.label}</span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                      G
                    </kbd>
                    <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] uppercase text-ink">
                      {item.key}
                    </kbd>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
              {isVi ? "Thao tác chung" : "General Actions"}
            </p>
            <ul className="space-y-2 text-[12.5px]">
              <li className="flex items-center justify-between">
                <span className="text-ink-soft">
                  {isVi ? "Bảng lệnh / Thêm nhanh" : "Command Palette"}
                </span>
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                  Ctrl K
                </kbd>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-ink-soft">
                  {isVi ? "Mở / Đóng bảng phím tắt" : "Toggle shortcuts"}
                </span>
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                  ?
                </kbd>
              </li>
              <li className="flex items-center justify-between">
                <span className="text-ink-soft">
                  {isVi ? "Đóng hộp thoại / Ngăn kéo" : "Close modal / drawer"}
                </span>
                <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink">
                  Esc
                </kbd>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
