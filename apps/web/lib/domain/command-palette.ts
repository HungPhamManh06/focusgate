export interface QuickCommandRoute {
  id: string;
  href: string;
  labelEn: string;
  labelVi: string;
  keywords: string[];
}

export const COMMAND_ROUTES: ReadonlyArray<QuickCommandRoute> = [
  { id: "dashboard", href: "/", labelEn: "Dashboard", labelVi: "Tổng quan", keywords: ["home", "gate", "tong quan"] },
  { id: "tasks", href: "/tasks", labelEn: "Tasks", labelVi: "Nhiệm vụ", keywords: ["todo", "backlog", "nhiem vu"] },
  { id: "planner", href: "/planner", labelEn: "Daily Planner", labelVi: "Kế hoạch ngày", keywords: ["plan", "ke hoach", "lock"] },
  { id: "focus", href: "/focus", labelEn: "Focus Studio", labelVi: "Tập trung (Studio)", keywords: ["timer", "pomodoro", "sound", "tap trung"] },
  { id: "wallet", href: "/wallet", labelEn: "Reward Wallet", labelVi: "Ví thưởng", keywords: ["pass", "grant", "vi thuong"] },
  { id: "statistics", href: "/statistics", labelEn: "Statistics & Passport", labelVi: "Thống kê & Hộ chiếu", keywords: ["stats", "health", "passport", "thong ke"] },
  { id: "devices", href: "/devices", labelEn: "Devices & Rules", labelVi: "Thiết bị & Quy tắc", keywords: ["block", "rules", "thiet bi"] },
  { id: "settings", href: "/settings", labelEn: "Settings", labelVi: "Cài đặt", keywords: ["language", "timezone", "cai dat"] },
];

export interface ParsedQuickTask {
  title: string;
  kind: "must_do" | "should_do" | "bonus";
}

/**
 * Parses a command palette input for quick task creation.
 * Supports prefixes like `+ Task title`, `! Task title` (must_do),
 * or `* Task title` (bonus).
 */
export function parseQuickTaskQuery(raw: string): ParsedQuickTask | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const title = trimmed.slice(1).trim();
    return title ? { title, kind: "must_do" } : null;
  }
  if (trimmed.startsWith("!")) {
    const title = trimmed.slice(1).trim();
    return title ? { title, kind: "must_do" } : null;
  }
  if (trimmed.startsWith("*")) {
    const title = trimmed.slice(1).trim();
    return title ? { title, kind: "bonus" } : null;
  }
  return { title: trimmed, kind: "must_do" };
}

export function filterCommandRoutes(query: string): QuickCommandRoute[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...COMMAND_ROUTES];
  if (q.startsWith("+") || q.startsWith("!") || q.startsWith("*")) return [];
  return COMMAND_ROUTES.filter(
    (route) =>
      route.labelEn.toLowerCase().includes(q) ||
      route.labelVi.toLowerCase().includes(q) ||
      route.keywords.some((kw) => kw.includes(q)),
  );
}
