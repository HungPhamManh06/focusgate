"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Timer } from "lucide-react";
import { useState } from "react";
import { KindBadge } from "@/components/domain/labels";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate, formatMinutes, formatTime, relativeDue } from "@/lib/data/format";
import type { FocusSession, Task } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function DashboardActivityTabs({
  dueSoonTasks,
  recentSessions,
  timezone,
  minValidFocusMinutes,
  locale = "en",
}: {
  dueSoonTasks: Task[];
  recentSessions: FocusSession[];
  timezone: string;
  minValidFocusMinutes: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [tab, setTab] = useState<"due" | "sessions">(
    dueSoonTasks.length > 0 ? "due" : "sessions",
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div className="inline-flex rounded-xl border border-line bg-surface-2/60 p-1">
          <button
            type="button"
            onClick={() => setTab("due")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
              tab === "due" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink",
            )}
          >
            <CalendarClock className="size-3.5 text-accent" />
            {isVi ? `Sắp đến hạn (${dueSoonTasks.length})` : `Due soon (${dueSoonTasks.length})`}
          </button>
          <button
            type="button"
            onClick={() => setTab("sessions")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
              tab === "sessions" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink",
            )}
          >
            <Timer className="size-3.5 text-accent" />
            {isVi ? `Phiên gần đây (${recentSessions.length})` : `Sessions (${recentSessions.length})`}
          </button>
        </div>

        <Link
          href={tab === "due" ? "/tasks" : "/focus"}
          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:underline"
        >
          {isVi ? "Xem tất cả" : "View all"} <ArrowRight className="size-3" />
        </Link>
      </CardHeader>

      <CardContent className="flex-1 pt-0">
        {tab === "due" ? (
          dueSoonTasks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">
              {isVi
                ? "Không có nhiệm vụ nào sắp đến hạn. Mọi thứ đang trong tầm kiểm soát!"
                : "No upcoming deadlines. Everything is under control!"}
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {dueSoonTasks.map((task) => {
                const due = relativeDue(task.dueDate, timezone, locale);
                const overdue = due ? due.includes("overdue") || due.includes("Quá hạn") : false;
                return (
                  <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink">{task.title}</p>
                      <p className={cn("text-[11px]", overdue ? "text-danger" : "text-muted")}>
                        {due ?? (isVi ? "Không hạn" : "No due date")}
                      </p>
                    </div>
                    <KindBadge kind={task.kind} locale={locale} />
                  </li>
                );
              })}
            </ul>
          )
        ) : recentSessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line p-4 text-[12.5px] text-muted">
            {isVi
              ? `Chưa có phiên nào. Mỗi phiên cần tối thiểu ${formatMinutes(minValidFocusMinutes)} để được tính hợp lệ.`
              : `No sessions yet. Minimum ${formatMinutes(minValidFocusMinutes)} required for a valid session.`}
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {recentSessions.map((session) => (
              <li key={session.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-ink">
                    {session.taskTitle ?? (isVi ? "Tập trung tự do" : "Free focus")}
                  </p>
                  <p className="text-[11px] text-muted">
                    {formatDate(session.startedAt, { month: "short", day: "numeric" }, timezone, locale)}{" "}
                    {isVi ? "lúc" : "at"} {formatTime(session.startedAt, timezone)} ·{" "}
                    {formatMinutes(session.isValid ? session.creditedMinutes : session.actualMinutes)}
                  </p>
                </div>
                <Badge tone={session.isValid ? "success" : "warning"}>
                  {session.isValid
                    ? isVi
                      ? "Hợp lệ"
                      : "Valid"
                    : isVi
                      ? "Ngắn"
                      : "Short"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
