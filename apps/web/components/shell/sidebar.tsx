"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Laptop, LogOut, Settings } from "lucide-react";
import { formatMinutes, initials } from "@/lib/data/format";
import { isSidebarWalletActive } from "@/lib/domain/dashboard-state";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { isNavActive, navItems } from "./nav-items";

export function Sidebar({
  displayName,
  availableMinutes,
  walletError = false,
  authEmail = null,
  language = "en",
}: {
  displayName: string;
  availableMinutes: number | null;
  walletError?: boolean;
  authEmail?: string | null;
  language?: "en" | "vi";
}) {
  const pathname = usePathname();
  const hasAvailableTime = isSidebarWalletActive(availableMinutes);
  const isVi = language === "vi";

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
      <div className="px-6 pb-8 pt-7">
        <Link href="/" aria-label="FocusGate home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <p className="label-xs px-3 pb-3 text-muted">{isVi ? "Không gian làm việc" : "Workspace"}</p>
        <ul className="space-y-1">
          {navItems.map((item) => {
            const active = isNavActive(item, pathname);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors",
                    active
                      ? "bg-accent-soft font-medium text-accent"
                      : "text-ink-soft hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <item.icon
                    className={cn("size-[17px]", active ? "text-accent" : "text-muted group-hover:text-ink-soft")}
                    strokeWidth={1.8}
                  />
                  {isVi ? item.labelVi : item.label}
                </Link>
              </li>
            );
          })}
          <li>
            <Link
              href="/devices"
              aria-current={pathname === "/devices" ? "page" : undefined}
              className={cn(
                "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors",
                pathname === "/devices"
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Laptop
                className={cn(
                  "size-[17px]",
                  pathname === "/devices" ? "text-accent" : "text-muted group-hover:text-ink-soft",
                )}
                strokeWidth={1.8}
              />
              {isVi ? "Thiết bị" : "Devices"}
            </Link>
          </li>
          <li>
            <Link
              href="/settings"
              aria-current={pathname === "/settings" ? "page" : undefined}
              className={cn(
                "group flex h-10 items-center gap-3 rounded-xl px-3 text-[13.5px] transition-colors",
                pathname === "/settings"
                  ? "bg-accent-soft font-medium text-accent"
                  : "text-ink-soft hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Settings
                className={cn(
                  "size-[17px]",
                  pathname === "/settings" ? "text-accent" : "text-muted group-hover:text-ink-soft",
                )}
                strokeWidth={1.8}
              />
              {isVi ? "Cài đặt" : "Settings"}
            </Link>
          </li>
        </ul>
      </nav>

      <div className="space-y-4 px-4 pb-5">
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <p className="label-xs text-muted">{isVi ? "Thời gian khả dụng" : "Available time"}</p>
            {hasAvailableTime ? (
              <span
                className="size-2 rounded-full bg-success"
                title={isVi ? "Có thời gian giải trí khả dụng" : "Leisure time available to spend"}
                aria-label={isVi ? "Có thời gian giải trí khả dụng" : "Leisure time available"}
              />
            ) : null}
          </div>
          {walletError || availableMinutes === null ? (
            <p className="mt-2.5 text-[12.5px] font-medium text-warning">
              {isVi ? "Không tải được số dư" : "Balance unavailable"}
            </p>
          ) : (
            <p className="mt-3 font-display text-[30px] leading-none tracking-[-0.02em] tabular-nums">
              {formatMinutes(availableMinutes)}
            </p>
          )}
          <Link
            href="/wallet"
            className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:underline"
          >
            {walletError || availableMinutes === null
              ? isVi ? "Thử lại trong ví" : "Retry in wallet"
              : isVi ? "Mở ví thưởng" : "Open wallet"}{" "}
            <ArrowUpRight className="size-3" />
          </Link>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium">{displayName}</p>
              <p className="truncate text-[11px] text-muted">
                {authEmail ?? (isVi ? "Không gian cục bộ" : "Local workspace")}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {authEmail ? (
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
