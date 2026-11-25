"use client";

import { Lock, LockOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { LivingGateVisual } from "@/components/domain/living-gate-visual";
import { GATE_THEMES, type GateThemeId } from "@/lib/domain/gate-themes";
import { Button } from "@/components/ui/button";

export function LandingGateDemo() {
  const [locked, setLocked] = useState(true);
  const [doneCount, setDoneCount] = useState(1);
  const [themeId, setThemeId] = useState<GateThemeId>("stone");

  return (
    <div className="rounded-3xl border border-line bg-surface p-6 shadow-xl">
      <div className="flex flex-col items-center gap-4">
        <LivingGateVisual
          status={locked ? "active" : "completed"}
          mustDoCompleted={locked ? doneCount : 3}
          mustDoTotal={3}
          isUnlocked={!locked}
          locale="vi"
          themeId={themeId}
        />

        <div className="flex flex-wrap justify-center gap-1.5">
          {GATE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setThemeId(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all ${
                themeId === t.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-surface-2/50 text-muted hover:text-ink"
              }`}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: t.accentHex }}
              />
              {t.nameVi}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={() => {
              if (!locked) {
                setLocked(true);
                setDoneCount(0);
              } else if (doneCount < 2) {
                setDoneCount((c) => c + 1);
              } else {
                setDoneCount(3);
                setLocked(false);
              }
            }}
          >
            {locked ? (
              <>
                <Sparkles className="size-3.5" /> Hoàn thành 1 việc Bắt buộc ({doneCount}/3)
              </>
            ) : (
              <>
                <Lock className="size-3.5" /> Khóa lại Cổng
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLocked((v) => !v)}
          >
            {locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
            {locked ? "Xem trạng thái Mở" : "Xem trạng thái Khóa"}
          </Button>
        </div>
      </div>
    </div>
  );
}
