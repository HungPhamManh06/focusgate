"use client";

import { CheckCircle2, Clock3, Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

interface SessionItem {
  id: string;
  taskTitle: string | null;
  creditedMinutes: number;
  actualMinutes: number;
  isValid: boolean;
  startedAt: string;
}

export function SessionHistoryTimeline({
  sessions,
}: {
  sessions: SessionItem[];
}) {
  const isVi = useLocale() === "vi";
  const [filter, setFilter] = useState<"all" | "valid">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filter === "valid" && !s.isValid) return false;
      if (!q) return true;
      return (s.taskTitle || "").toLowerCase().includes(q);
    });
  }, [sessions, filter, query]);

  const totalCredited = filtered.reduce((acc, s) => acc + s.creditedMinutes, 0);

  return (
    <Card className="mt-4 fg-bento-glow">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 className="size-4 text-accent" />
          <CardTitle>{isVi ? "Dòng thời gian Phiên Hôm nay" : "Today's Session Timeline"}</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="inline-flex rounded-full border border-line bg-surface-2 p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                filter === "all" ? "bg-ink text-canvas" : "text-muted hover:text-ink",
              )}
            >
              {isVi ? "Tất cả" : "All"}
            </button>
            <button
              type="button"
              onClick={() => setFilter("valid")}
              className={cn(
                "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                filter === "valid" ? "bg-ink text-canvas" : "text-muted hover:text-ink",
              )}
            >
              {isVi ? "Hợp lệ" : "Verified"}
            </button>
          </div>
          <span className="rounded-full border border-line bg-surface-2 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-ink tabular-nums">
            {formatMinutes(totalCredited)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        {sessions.length > 2 ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-1.5">
            <Search className="size-3.5 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isVi ? "Lọc nhanh theo tên công việc…" : "Filter sessions by task…"}
              className="w-full bg-transparent text-[12px] text-ink outline-none placeholder:text-muted"
            />
          </div>
        ) : null}

        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[12px] text-muted">
            {isVi ? "Không có phiên phù hợp." : "No matching sessions."}
          </p>
        ) : (
          <ol className="relative space-y-2 border-l border-line pl-4">
            {filtered.map((s) => (
              <li key={s.id} className="relative flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-[12px]">
                <span
                  aria-hidden
                  className={cn(
                    "absolute -left-[21px] size-2.5 rounded-full ring-2 ring-surface",
                    s.isValid ? "bg-success" : "bg-warning",
                  )}
                />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">
                    {s.taskTitle || (isVi ? "Tập trung tự do" : "Free focus")}
                  </p>
                  <p className="text-[10.5px] text-muted tabular-nums">
                    {new Date(s.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {s.isValid ? (isVi ? "Hợp lệ" : "Verified") : isVi ? "Dưới ngưỡng" : "Below threshold"}
                  </p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[11.5px] font-semibold tabular-nums">
                  {s.isValid ? (
                    <CheckCircle2 className="size-3.5 text-success" />
                  ) : (
                    <ShieldAlert className="size-3.5 text-warning" />
                  )}
                  {formatMinutes(s.creditedMinutes || s.actualMinutes)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
