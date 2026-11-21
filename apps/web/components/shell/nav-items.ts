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
  icon: LucideIcon;
  exact?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/tasks", label: "Tasks", icon: ListTodo },
  { href: "/planner", label: "Planner", icon: CalendarClock },
  { href: "/focus", label: "Focus", icon: Timer },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/statistics", label: "Statistics", icon: BarChart3 },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
