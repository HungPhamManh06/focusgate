import {
  BarChart3,
  CalendarClock,
  LayoutDashboard,
  ListTodo,
  Timer,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", shortLabel: "Today", icon: LayoutDashboard, exact: true },
  { href: "/tasks", label: "Tasks", shortLabel: "Tasks", icon: ListTodo },
  { href: "/planner", label: "Planner", shortLabel: "Plan", icon: CalendarClock },
  { href: "/focus", label: "Focus", shortLabel: "Focus", icon: Timer },
  { href: "/wallet", label: "Wallet", shortLabel: "Wallet", icon: Wallet },
  { href: "/statistics", label: "Statistics", shortLabel: "Stats", icon: BarChart3 },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
