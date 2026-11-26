"use client";

import { AlertCircle, Minus, Plus, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TARGET_KEY = "focusgate:monthly-target-hours";

const TRIGGER_META: Record<string, { en: string; vi: string; tipEn: string; tipVi: string }> = {
  messages: {
    en: "Messages & DMs",
    vi: "Tin nhắn & Thông báo",
    tipEn: "Silence phone notifications during sprints.",
    tipVi: "Bật Không làm phiền khi vào phiên.",
  },
  fatigue: {
    en: "Mental Fatigue",
    vi: "Mệt mỏi",
    tipEn: "Try shorter 25m blocks with 5m walks.",
    tipVi: "Thử nhịp 25p ngắn hơn kèm đi lại 5p.",
  },
  impulse: {
    en: "Mindless Browsing",
    vi: "Lướt vô thức",
    tipEn: "Keep stricter block rules active.",
    tipVi: "Bật chế độ khóa nghiêm ngặt hơn.",
  },
  urgent: {
    en: "Urgent Interruptions",
    vi: "Việc đột xuất",
    tipEn: "Capture to Scratchpad and resume.",
    tipVi: "Ghi vào Sổ nháp rồi quay lại ngay.",
  },
};

export function MonthlyTargetAndTriggers({
  focusMinutes,
  locale = "en",
}: {
  focusMinutes: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [targetHours, setTargetHours] = useState(40);
  const [triggers, setTriggers] = useState<Record<string, number>>({});

  useEffect(() => {
    try {
      const savedTarget = Number(window.localStorage.getItem(TARGET_KEY));
      if (Number.isFinite(savedTarget) && savedTarget >= 5 && savedTarget <= 200) {
        setTargetHours(savedTarget);
      }
      const raw = JSON.parse(
        window.localStorage.getItem("focusgate:distraction-triggers") || "{}",
      ) as Record<string, number>;
      if (raw && typeof raw === "object") setTriggers(raw);
    } catch {
      // ignore
    }
  }, []);

  function adjustTarget(delta: number) {
    setTargetHours((prev) => {
      const next = Math.max(5, Math.min(200, prev + delta));
      try {
        window.localStorage.setItem(TARGET_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  const doneHours = Math.round((focusMinutes / 60) * 10) / 10;
  const pct = Math.min(100, Math.round((doneHours / Math.max(1, targetHours)) * 100));
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  const entries = Object.entries(triggers)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const totalTriggers = entries.reduce((acc, [, c]) => acc + c, 0);

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      {/* #5 Monthly Focus Target Ring */}
      <Card className="fg-bento-glow">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Target className="size-4 text-accent" />
            <CardTitle>{isVi ? "Mục tiêu Giờ Tháng" : "Monthly Focus Target"}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => adjustTarget(-5)}
              aria-label="Decrease monthly target"
              className="rounded-md border border-line bg-surface-2 p-1 text-muted hover:text-ink"
            >
              <Minus className="size-3" />
            </button>
            <span className="px-2 font-mono text-[11.5px] font-semibold tabular-nums">
              {targetHours}h
            </span>
            <button
              type="button"
              onClick={() => adjustTarget(5)}
              aria-label="Increase monthly target"
              className="rounded-md border border-line bg-surface-2 p-1 text-muted hover:text-ink"
            >
              <Plus className="size-3" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-5 pt-2">
          <svg width="84" height="84" viewBox="0 0 84 84" className="shrink-0">
            <circle cx="42" cy="42" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="8" />
            <circle
              cx="42"
              cy="42"
              r={r}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              transform="rotate(-90 42 42)"
            />
            <text
              x="42"
              y="46"
              textAnchor="middle"
              fill="var(--ink)"
              fontSize="14"
              fontWeight="700"
            >
              {pct}%
            </text>
          </svg>
          <div>
            <p className="font-display text-[26px] leading-none tabular-nums">
              {doneHours}h{" "}
              <span className="font-sans text-[12.5px] text-muted">/ {targetHours}h</span>
            </p>
            <p className="mt-1.5 text-[12px] text-muted">
              {pct >= 100
                ? isVi
                  ? "Tuyệt vời! Bạn đã cán đích mục tiêu giờ tập trung."
                  : "Outstanding! You reached your focus hour goal."
                : isVi
                  ? `Còn ${Math.max(0, Math.round((targetHours - doneHours) * 10) / 10)} giờ để hoàn thành mục tiêu.`
                  : `${Math.max(0, Math.round((targetHours - doneHours) * 10) / 10)}h remaining to reach your target.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* #6 Distraction Triggers Insight Card */}
      <Card className="fg-bento-glow">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 text-accent" />
            <CardTitle>{isVi ? "Nguyên nhân Gây Gián đoạn" : "Distraction Triggers"}</CardTitle>
          </div>
          <span className="text-[11px] text-muted tabular-nums">
            {totalTriggers} {isVi ? "lần ghi nhận" : "logged"}
          </span>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-2">
          {entries.length === 0 ? (
            <p className="py-4 text-[12px] text-muted">
              {isVi
                ? "Chưa có dữ liệu. Khi tạm dừng phiên trên /focus, hãy chọn nhanh lý do để theo dõi tại đây."
                : "No triggers logged yet. Pause any session on /focus and tag what interrupted you."}
            </p>
          ) : (
            entries.map(([key, count]) => {
              const meta = TRIGGER_META[key];
              const share = Math.round((count / Math.max(1, totalTriggers)) * 100);
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-medium text-ink">
                      {meta ? (isVi ? meta.vi : meta.en) : key}
                    </span>
                    <span className="font-mono text-muted tabular-nums">
                      {count} ({share}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                  </div>
                  {meta ? (
                    <p className="text-[10.5px] text-muted">{isVi ? meta.tipVi : meta.tipEn}</p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
