"use client";

import { ListOrdered, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type QueueBlock = {
  id: string;
  label: string;
  minutes: number;
};

const STORAGE_KEY = "focusgate:focus-queue";

export function FocusQueueCard() {
  const isVi = useLocale() === "vi";
  const [items, setItems] = useState<QueueBlock[]>([]);
  const [label, setLabel] = useState("");
  const [mins, setMins] = useState("25");

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as QueueBlock[];
      if (Array.isArray(saved)) setItems(saved);
    } catch {
      // ignore
    }
  }, []);

  function save(next: QueueBlock[]) {
    setItems(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const clean = label.trim();
    const m = Math.max(5, Math.min(180, Number.parseInt(mins, 10) || 25));
    if (!clean) return;
    save([...items, { id: String(Date.now()), label: clean, minutes: m }]);
    setLabel("");
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <ListOrdered className="size-4 text-accent" />
            {isVi ? "Hàng đợi Phiên liên tiếp (Focus Queue)" : "Session Queue"}
          </CardTitle>
          <p className="mt-0.5 text-[11.5px] text-muted">
            {isVi
              ? "Xếp sẵn các phiên tiếp theo để giữ đà tập trung không bị ngắt quãng."
              : "Line up your next focus blocks to keep momentum uninterrupted."}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-2">
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={isVi ? "VD: Đọc tài liệu hệ thống" : "e.g. Read system design docs"}
            className="flex-1"
          />
          <Input
            type="number"
            min={5}
            max={180}
            value={mins}
            onChange={(e) => setMins(e.target.value)}
            className="w-20"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!label.trim()}>
            <Plus className="size-3.5" />
          </Button>
        </form>

        {items.length > 0 ? (
          <div className="space-y-1.5">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12.5px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10.5px] font-bold text-accent">
                    {idx + 1}
                  </span>
                  <span className="truncate font-medium text-ink">{item.label}</span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[11px] text-muted">{item.minutes}m</span>
                  <button
                    type="button"
                    onClick={() => save(items.filter((q) => q.id !== item.id))}
                    className="text-muted hover:text-danger"
                    aria-label="Remove queued session"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
