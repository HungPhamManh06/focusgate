"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Laptop,
  Lock,
  LockOpen,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";
import { useEffect, useState } from "react";
import { formatMinutes, initials } from "@/lib/data/format";
import { isSidebarWalletActive } from "@/lib/domain/dashboard-state";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { SidebarAmbientPlayer } from "@/components/shell/sidebar-ambient-player";
import { ActivityBellDrawer } from "@/components/shell/activity-bell-drawer";
import { isNavActive, navItems } from "./nav-items";

const QUICK_THEMES = [
  { id: "crimson", label: "Crimson", isDark: false, dot: "#b91c1c" },
  { id: "espresso", label: "Espresso", isDark: true, dot: "#28181a" },
  { id: "matcha", label: "Kyoto Matcha", isDark: false, dot: "#2d6a4f" },
  { id: "nordic", label: "Nordic Slate", isDark: false, dot: "#2563eb" },
] as const;

export function Sidebar({
  displayName,
  availableMinutes,
  walletError = false,
  authEmail = null,
  language = "en",
  gateUnlocked = false,
  mustDoRemaining = 0,
}: {
  displayName: string;
  availableMinutes: number | null;
  walletError?: boolean;
  authEmail?: string | null;
  language?: "en" | "vi";
  gateUnlocked?: boolean;
  mustDoRemaining?: number;
}) {
  const pathname = usePathname();
  const hasAvailableTime = isSidebarWalletActive(availableMinutes);
  const isVi = language === "vi";
  const [collapsed, setCollapsed] = useState(false);
  const [activePreset, setActivePreset] = useState<string>("crimson");

  useEffect(() => {
    try {
      const savedCollapsed = window.localStorage.getItem("focusgate-sidebar-collapsed") === "1";
      setCollapsed(savedCollapsed);
      document.documentElement.style.setProperty("--sidebar-w", savedCollapsed ? "76px" : "250px");

      const savedPreset = window.localStorage.getItem("focusgate-preset");
      if (savedPreset) setActivePreset(savedPreset);
      else if (document.documentElement.classList.contains("dark")) setActivePreset("espresso");
    } catch {
      // ignore
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      document.documentElement.style.setProperty("--sidebar-w", next ? "76px" : "250px");
      try {
        window.localStorage.setItem("focusgate-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function applyQuickTheme(item: (typeof QUICK_THEMES)[number]) {
    setActivePreset(item.id);
    document.documentElement.classList.toggle("dark", item.isDark);
    if (item.id === "matcha" || item.id === "nordic") {
      document.documentElement.setAttribute("data-preset", item.id);
    } else {
      document.documentElement.removeAttribute("data-preset");
    }
    try {
      window.localStorage.setItem("focusgate-preset", item.id);
      window.localStorage.setItem("focusgate-theme", item.isDark ? "dark" : "light");
    } catch {
      // ignore
    }
  }

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface transition-all duration-200 lg:flex">
      <div className={cn("pb-4 pt-6", collapsed ? "px-3" : "px-5")}>
        <div className={cn("flex items-center", collapsed ? "justify-center" : "justify-between")}>
          <Link href="/" aria-label="FocusGate home" className="min-w-0">
            {collapsed ? (
              <span className="flex size-9 items-center justify-center rounded-xl bg-accent font-display text-[17px] font-bold text-white">
                F
              </span>
            ) : (
              <Logo />
            )}
          </Link>
          {!collapsed ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={isVi ? "Thu gọn thanh bên" : "Collapse sidebar"}
              aria-label={isVi ? "Thu gọn thanh bên" : "Collapse sidebar"}
              className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <PanelLeftClose className="size-4" />
            </button>
          ) : null}
        </div>

        {collapsed ? (
          <button
            type="button"
            onClick={toggleCollapsed}
            title={isVi ? "Mở rộng thanh bên" : "Expand sidebar"}
            aria-label={isVi ? "Mở rộng thanh bên" : "Expand sidebar"}
            className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-line bg-surface-2/70 text-muted transition-colors hover:border-accent/40 hover:text-ink"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
              );
            }}
            className="mt-4 flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/70 px-3 py-2 text-[12px] text-muted transition-all hover:border-accent/35 hover:text-ink active:scale-[0.98]"
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5" />
              {isVi ? "Lệnh nhanh..." : "Quick command..."}
            </span>
            <kbd className="rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">
              Ctrl K
            </kbd>
          </button>
        )}

        {!collapsed ? (
          <Link
            href="/planner"
            className={cn(
              "mt-2.5 flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-colors",
              gateUnlocked
                ? "border-success/35 bg-success-soft/60 text-success"
                : "border-accent/25 bg-accent-soft/60 text-accent",
            )}
          >
            {gateUnlocked ? <LockOpen className="size-3.5 shrink-0" /> : <Lock className="size-3.5 shrink-0" />}
            <span className="truncate">
              {gateUnlocked
                ? isVi
                  ? "Cổng hôm nay đã mở"
                  : "Gate unlocked today"
                : mustDoRemaining > 0
                  ? isVi
                    ? `Còn ${mustDoRemaining} việc Bắt buộc`
                    : `${mustDoRemaining} Must-Do left`
                  : isVi
                    ? "Chưa lập Cổng hôm nay"
                    : "Build today's gate"}
            </span>
          </Link>
        ) : null}
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3">
        {!collapsed ? (
          <p className="label-xs px-3 pb-2.5 text-muted">
            {isVi ? "Không gian làm việc" : "Workspace"}
          </p>
        ) : null}
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isNavActive(item, pathname);
            const label = isVi ? item.labelVi : item.label;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center rounded-xl text-[13.5px] transition-colors",
                    collapsed ? "justify-center px-0" : "gap-3 px-3",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <item.icon
                    className={cn(
                      "size-[17px] shrink-0",
                      active ? "text-accent" : "text-muted group-hover:text-ink-soft",
                    )}
                    strokeWidth={1.8}
                  />
                  {!collapsed ? label : null}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/devices"
              title={collapsed ? (isVi ? "Thiết bị" : "Devices") : undefined}
              aria-current={pathname === "/devices" ? "page" : undefined}
              className={cn(
                "group flex h-10 items-center rounded-xl text-[13.5px] transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                pathname === "/devices"
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Laptop
                className={cn(
                  "size-[17px] shrink-0",
                  pathname === "/devices" ? "text-accent" : "text-muted group-hover:text-ink-soft",
                )}
                strokeWidth={1.8}
              />
              {!collapsed ? (isVi ? "Thiết bị" : "Devices") : null}
            </Link>
          </li>
          <li>
            <Link
              href="/settings"
              title={collapsed ? (isVi ? "Cài đặt" : "Settings") : undefined}
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={cn(
                "group flex h-10 items-center rounded-xl text-[13.5px] transition-colors",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                pathname === "/settings"
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Settings
                className={cn(
                  "size-[17px] shrink-0",
                  pathname === "/settings" ? "text-accent" : "text-muted group-hover:text-ink-soft",
                )}
                strokeWidth={1.8}
              />
              {!collapsed ? (isVi ? "Cài đặt" : "Settings") : null}
            </Link>
          </li>
        </ul>
      </nav>

      <div className={cn("space-y-3 pb-4", collapsed ? "px-2.5" : "px-4")}>
        {!collapsed ? (
          <>
            <SidebarAmbientPlayer isVi={isVi} />
            <div className="rounded-2xl border border-line bg-surface-2 p-3.5">
              <div className="flex items-center justify-between">
                <p className="label-xs text-muted">{isVi ? "Thời gian khả dụng" : "Available time"}</p>
                {hasAvailableTime ? (
                  <span
                    className="size-2 rounded-full bg-success"
                    title={isVi ? "Có thời gian giải trí khả dụng" : "Leisure time available"}
                  />
                ) : null}
              </div>
              {walletError || availableMinutes === null ? (
                <p className="mt-2 text-[12px] font-medium text-warning">
                  {isVi ? "Không tải được số dư" : "Balance unavailable"}
                </p>
              ) : (
                <p className="mt-2 font-display text-[28px] leading-none tracking-[-0.02em] tabular-nums">
                  {formatMinutes(availableMinutes)}
                </p>
              )}
              <Link
                href="/wallet"
                className="mt-2.5 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
              >
                {walletError || availableMinutes === null
                  ? isVi ? "Thử lại trong ví" : "Retry in wallet"
                  : isVi ? "Mở ví thưởng" : "Open wallet"}{" "}
                <ArrowUpRight className="size-3" />
              </Link>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3 py-2">
              <span className="text-[11px] font-medium text-muted">
                {isVi ? "Bảng màu" : "Theme"}
              </span>
              <div className="flex items-center gap-1.5">
                {QUICK_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => applyQuickTheme(t)}
                    title={t.label}
                    aria-label={t.label}
                    className={cn(
                      "size-4 rounded-full border border-white/40 transition-transform hover:scale-125",
                      activePreset === t.id && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
                    )}
                    style={{ backgroundColor: t.dot }}
                  />
                ))}
              </div>
            </div>
          </>
        ) : null}

        <div
          className={cn(
            "flex items-center border-t border-line pt-3",
            collapsed ? "flex-col gap-2" : "justify-between",
          )}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              title={displayName}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas"
            >
              {initials(displayName)}
            </span>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-medium">{displayName}</p>
                <p className="truncate text-[11px] text-muted">
                  {authEmail ?? (isVi ? "Không gian cục bộ" : "Local workspace")}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ActivityBellDrawer collapsed={collapsed} />
            {authEmail && !collapsed ? (
              <form action="/auth/signout" method="post">
                <button
                  type="submit"
                  title={isVi ? "Đăng xuất" : "Sign out"}
                  aria-label={isVi ? "Đăng xuất" : "Sign out"}
                  className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
      </div>
    </aside>
  );
}
