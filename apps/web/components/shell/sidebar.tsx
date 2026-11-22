"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { formatMinutes, initials } from "@/lib/data/format";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { isNavActive, navItems } from "./nav-items";

export function Sidebar({
  displayName,
  availableMinutes,
}: {
  displayName: string;
  availableMinutes: number;
}) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen flex-col border-r border-line bg-surface lg:flex">
      <div className="px-6 pb-8 pt-7">
        <Link href="/" aria-label="FocusGate home">
          <Logo />
        </Link>
      </div>

      <nav aria-label="Primary" className="flex-1 px-3">
        <p className="label-xs px-3 pb-3 text-muted">Workspace</p>
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
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="space-y-4 px-4 pb-5">
        <div className="rounded-2xl border border-line bg-surface-2 p-4">
          <div className="flex items-center justify-between">
            <p className="label-xs text-muted">Available time</p>
            <span className="size-1.5 rounded-full bg-success" aria-hidden />
          </div>
          <p className="mt-3 font-display text-[30px] leading-none tracking-[-0.02em] tabular-nums">
            {formatMinutes(availableMinutes)}
          </p>
          <Link
            href="/wallet"
            className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
          >
            Open wallet <ArrowUpRight className="size-3" />
          </Link>
        </div>

        <div className="flex items-center justify-between border-t border-line pt-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] font-semibold text-canvas">
              {initials(displayName)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium">{displayName}</p>
              <p className="text-[10.5px] text-muted">Local workspace</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
