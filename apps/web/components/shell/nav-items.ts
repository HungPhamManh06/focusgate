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
  labelVi: string;
  shortLabel: string;
  shortLabelVi: string;
  icon: LucideIcon;
  exact?: boolean;
}

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", labelVi: "Tổng quan", shortLabel: "Today", shortLabelVi: "Hôm nay", icon: LayoutDashboard, exact: true },
  { href: "/tasks", label: "Tasks", labelVi: "Nhiệm vụ", shortLabel: "Tasks", shortLabelVi: "Việc", icon: ListTodo },
  { href: "/planner", label: "Planner", labelVi: "Kế hoạch", shortLabel: "Plan", shortLabelVi: "Kế hoạch", icon: CalendarClock },
  { href: "/focus", label: "Focus", labelVi: "Tập trung", shortLabel: "Focus", shortLabelVi: "Focus", icon: Timer },
  { href: "/wallet", label: "Wallet", labelVi: "Ví thưởng", shortLabel: "Wallet", shortLabelVi: "Ví", icon: Wallet },
  { href: "/statistics", label: "Statistics", labelVi: "Thống kê", shortLabel: "Stats", shortLabelVi: "Thống kê", icon: BarChart3 },
];

export function isNavActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
