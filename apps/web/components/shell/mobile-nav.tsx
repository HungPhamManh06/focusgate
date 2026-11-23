"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { isNavActive, navItems } from "./nav-items";

export function MobileNav({ language = "en" }: { language?: "en" | "vi" }) {
  const pathname = usePathname();
  const isVi = language === "vi";

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-6">
        {navItems.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={cn(
                  "flex min-h-[56px] flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-accent" : "text-muted hover:text-ink",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-9 items-center justify-center rounded-full transition-colors",
                    active && "bg-accent-soft",
                  )}
                >
                  <item.icon className="size-[17px]" strokeWidth={active ? 2 : 1.8} />
                </span>
                <span className="truncate">{isVi ? item.shortLabelVi : item.shortLabel}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
