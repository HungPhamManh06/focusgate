"use client";

import { Brain } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Entry = {
  date: string;
  quality: "deep" | "steady" | "distracted";
  minutes: number;
};

export function ReflectionHistoryCard() {
  const isVi = useLocale() === "vi";
  const [entries, setEntries] = useState<Entry[]>([]);

  useEffect(() => {
    try {
      const collected: Entry[] = [];
      for (let i = 0; i < 7; i += 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const iso = d.toISOString().slice(0, 10);
        const raw = window.localStorage.getItem(`focusgate:debrief-log:${iso}`);
        if (!raw) continue;
        const list = JSON.parse(raw) as Array<{ quality: Entry["quality"]; minutes: number }>;
        for (const item of list) {
          collected.push({ date: iso, quality: item.quality, minutes: item.minutes });
        }
      }
      setEntries(collected.slice(0, 12));
    } catch {
      // ignore
    }
  }, []);

  if (entries.length === 0) return null;

  const deepCount = entries.filter((e) => e.quality === "deep").length;
  const steadyCount = entries.filter((e) => e.quality === "steady").length;
  const distractedCount = entries.filter((e) => e.quality === "distracted").length;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Brain className="size-4 text-accent" />
          {isVi ? "Nhật ký Độ sâu Tập trung (7 ngày)" : "Focus Depth Reflections (7d)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <div className="flex flex-wrap gap-2 text-[12px]">
          <span className="rounded-full bg-success-soft px-3 py-1 font-semibold text-success">
            🔥 {isVi ? `Sâu: ${deepCount}` : `Deep: ${deepCount}`}
          </span>
          <span className="rounded-full bg-surface-2 px-3 py-1 font-semibold text-ink-soft">
            👍 {isVi ? `Ổn định: ${steadyCount}` : `Steady: ${steadyCount}`}
          </span>
          <span className="rounded-full bg-warning-soft px-3 py-1 font-semibold text-warning">
            😵‍💫 {isVi ? `Xao nhãng: ${distractedCount}` : `Distracted: ${distractedCount}`}
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {entries.map((e, idx) => (
            <span
              key={`${e.date}-${idx}`}
              className="rounded-lg border border-line bg-surface-2/60 px-2.5 py-1 text-[11px] text-ink-soft"
            >
              {e.quality === "deep" ? "🔥" : e.quality === "steady" ? "👍" : "😵‍💫"} {e.minutes}m ·{" "}
              <span className="text-muted">{e.date.slice(5)}</span>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
