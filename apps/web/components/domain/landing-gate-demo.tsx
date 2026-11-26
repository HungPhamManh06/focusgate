"use client";

import { Check, Lock, LockOpen, Sparkles } from "lucide-react";
import { useState } from "react";
import { LivingGateVisual } from "@/components/domain/living-gate-visual";
import { GATE_THEMES, type GateThemeId } from "@/lib/domain/gate-themes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SAMPLE_TASKS = [
  { id: "t1", title: "Hoàn thành 1 phiên tập trung sâu 25p", mins: 25 },
  { id: "t2", title: "Đọc 20 trang tài liệu chuyên môn", mins: 20 },
  { id: "t3", title: "Luyện tập thể dục 15 phút", mins: 15 },
] as const;

const STUDIO_PALETTES = [
  { id: "crimson", label: "Crimson", bg: "#faf7f5", ink: "#181213", accent: "#b91c1c" },
  { id: "espresso", label: "Espresso", bg: "#171012", ink: "#f7f1f1", accent: "#f87171" },
  { id: "matcha", label: "Kyoto Matcha", bg: "#f3f5f0", ink: "#162119", accent: "#2d6a4f" },
  { id: "nordic", label: "Nordic Slate", bg: "#f3f6fa", ink: "#0f172a", accent: "#2563eb" },
] as const;

export function LandingGateDemo() {
  const [checkedIds, setCheckedIds] = useState<string[]>(["t1"]);
  const [themeId, setThemeId] = useState<GateThemeId>("stone");
  const [paletteIdx, setPaletteIdx] = useState(0);

  const doneCount = checkedIds.length;
  const unlocked = doneCount === SAMPLE_TASKS.length;
  const earnedMinutes = doneCount * 15;
  const pal = STUDIO_PALETTES[paletteIdx] ?? STUDIO_PALETTES[0];

  function toggleTask(id: string) {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  return (
    <div
      className="rounded-3xl border border-line p-6 shadow-xl transition-colors duration-300"
      style={{ backgroundColor: pal.bg, color: pal.ink }}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
          Live Gate Sandbox
        </span>
        <div className="flex items-center gap-1">
          {STUDIO_PALETTES.map((p, idx) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPaletteIdx(idx)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium transition-all",
                paletteIdx === idx
                  ? "border-current opacity-100"
                  : "border-transparent opacity-60 hover:opacity-90",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: p.accent }}
              />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <LivingGateVisual
          status={unlocked ? "completed" : "active"}
          mustDoCompleted={doneCount}
          mustDoTotal={SAMPLE_TASKS.length}
          isUnlocked={unlocked}
          locale="vi"
          themeId={themeId}
        />

        <div className="w-full space-y-2">
          {SAMPLE_TASKS.map((task) => {
            const done = checkedIds.includes(task.id);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => toggleTask(task.id)}
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-current/15 px-3.5 py-2.5 text-left text-[12.5px] transition-all hover:border-current/35"
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors"
                    style={{
                      backgroundColor: done ? pal.accent : "transparent",
                      borderColor: done ? pal.accent : "currentColor",
                      color: done ? "#ffffff" : "inherit",
                    }}
                  >
                    {done ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <span className={done ? "line-through opacity-60" : "font-medium"}>
                    {task.title}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] font-semibold opacity-75">
                  +{task.mins}p
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex w-full items-center justify-between rounded-xl border border-current/15 px-3.5 py-2 text-[12px]">
          <span className="opacity-75">Ví thưởng tích lũy thử nghiệm</span>
          <span className="font-bold" style={{ color: pal.accent }}>
            +{earnedMinutes} phút giải trí
          </span>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {GATE_THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setThemeId(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all",
                themeId === t.id
                  ? "border-current opacity-100"
                  : "border-current/15 opacity-65 hover:opacity-100",
              )}
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
            onClick={() =>
              setCheckedIds(unlocked ? [] : SAMPLE_TASKS.map((t) => t.id))
            }
          >
            {unlocked ? (
              <>
                <Lock className="size-3.5" /> Khóa lại Cổng thử
              </>
            ) : (
              <>
                <Sparkles className="size-3.5" /> Hoàn thành hết để mở Cổng
              </>
            )}
          </Button>
          {unlocked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-[11.5px] font-semibold text-success">
              <LockOpen className="size-3.5" /> Cổng đã mở!
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
