"use client";

import { Gift, Pencil, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { formatMinutes } from "@/lib/data/format";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const STORAGE_KEY = "focusgate:reward-wishlist";

export function RewardWishlistCard({ availableMinutes }: { availableMinutes: number }) {
  const isVi = useLocale() === "vi";
  const [title, setTitle] = useState(
    isVi ? "Xem trọn bộ phim cuối tuần" : "Weekend movie night",
  );
  const [targetMinutes, setTargetMinutes] = useState(120);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as {
        title?: string;
        targetMinutes?: number;
      } | null;
      if (saved?.title) setTitle(saved.title);
      if (saved?.targetMinutes && saved.targetMinutes >= 15) setTargetMinutes(saved.targetMinutes);
    } catch {
      // ignore
    }
  }, []);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const clamped = Math.max(15, Math.min(600, targetMinutes || 120));
    setTargetMinutes(clamped);
    setEditing(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, targetMinutes: clamped }));
    } catch {
      // ignore
    }
  }

  const pct = Math.min(100, Math.round((availableMinutes / Math.max(1, targetMinutes)) * 100));
  const unlocked = availableMinutes >= targetMinutes;

  return (
    <Card className="mt-4">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Gift className="size-4 text-accent" />
          {isVi ? "Mục tiêu Tự thưởng (Reward Wish-List)" : "Reward Wish-List Goal"}
        </CardTitle>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-muted hover:text-ink"
        >
          <Pencil className="size-3" />
          {isVi ? "Đổi mục tiêu" : "Edit goal"}
        </button>
      </CardHeader>
      <CardContent className="pt-2">
        {editing ? (
          <form onSubmit={save} className="flex flex-wrap gap-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1 min-w-[180px]"
              placeholder={isVi ? "Phần thưởng mong muốn…" : "Your big reward…"}
            />
            <Input
              type="number"
              min={15}
              max={600}
              value={targetMinutes}
              onChange={(e) => setTargetMinutes(Number(e.target.value))}
              className="w-24"
            />
            <Button type="submit" variant="accent" size="sm">
              {isVi ? "Lưu" : "Save"}
            </Button>
          </form>
        ) : (
          <div>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[13.5px] font-semibold text-ink">{title}</p>
              <span className="text-[12px] font-medium tabular-nums text-muted">
                {formatMinutes(Math.min(availableMinutes, targetMinutes))} / {formatMinutes(targetMinutes)} ({pct}%)
              </span>
            </div>
            <Progress value={pct} tone={unlocked ? "success" : "accent"} className="mt-2 h-2" />
            {unlocked ? (
              <p className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-success">
                <Sparkles className="size-3.5" />
                {isVi ? "Đã đủ phút thưởng để tự thưởng ngay!" : "Goal unlocked — enjoy your reward!"}
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
