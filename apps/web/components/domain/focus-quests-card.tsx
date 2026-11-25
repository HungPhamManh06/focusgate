"use client";

import { Crown, Flame, Lock, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { useTransition } from "react";
import { joinFocusQuestAction, setGateThemeAction } from "@/lib/actions/v5";
import type { FocusQuestRecord } from "@/lib/data/v5-ecosystem";
import {
  FOCUS_QUEST_CATALOG,
  GATE_THEMES,
  isGateThemeUnlocked,
  type GateThemeId,
} from "@/lib/domain/gate-themes";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function FocusQuestsAndGateCard({
  activeTheme,
  bestStreak,
  weeklyFocusMinutes,
  quests,
}: {
  activeTheme: GateThemeId;
  bestStreak: number;
  weeklyFocusMinutes: number;
  quests: FocusQuestRecord[];
}) {
  const locale = useLocale();
  const isVi = locale === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const activeKeys = new Set(quests.map((q) => q.questKey));

  const handleThemeSelect = (id: GateThemeId, unlocked: boolean) => {
    if (!unlocked) return;
    startTransition(async () => {
      const res = await setGateThemeAction(id);
      if (res.error) toast.push("error", res.error);
      else toast.push("success", isVi ? "Đã đổi chất liệu Cổng Living Gate!" : "Living Gate material updated!");
    });
  };

  const handleJoinQuest = (key: "bedtime_7d" | "deep_work_10h" | "consistency_21d") => {
    startTransition(async () => {
      const res = await joinFocusQuestAction(key, locale);
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {/* Evolving Living Gate Materials */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Crown className="size-4 text-accent" />
            {isVi ? "Cổng Tiến Hóa (Evolving Gate)" : "Evolving Living Gate"}
          </CardTitle>
          <Badge tone="accent">
            <Flame className="mr-1 size-3" />
            {isVi ? `Kỷ lục ${bestStreak} ngày` : `Best ${bestStreak}d`}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-2">
          <p className="text-[12px] text-muted">
            {isVi
              ? "Giữ chuỗi ngày kỷ luật để mở khóa chất liệu mới cho Cổng FocusGate trên cả Web & Android."
              : "Build your streak to unlock new Living Gate materials synced across Web & Android."}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {GATE_THEMES.map((theme) => {
              const unlocked = isGateThemeUnlocked(theme.id, bestStreak);
              const selected = activeTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  disabled={!unlocked || pending}
                  onClick={() => handleThemeSelect(theme.id, unlocked)}
                  className={cn(
                    "flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                    selected
                      ? "border-accent bg-accent-soft/50 ring-1 ring-accent"
                      : unlocked
                        ? "border-line bg-surface-2/40 hover:border-accent/40"
                        : "cursor-not-allowed border-line/50 bg-surface-2/20 opacity-60",
                  )}
                >
                  <span
                    className="mt-0.5 size-5 shrink-0 rounded-full border border-white/20"
                    style={{ backgroundColor: theme.accentHex }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-[12px] font-semibold text-ink">
                        {isVi ? theme.nameVi : theme.nameEn}
                      </span>
                      {!unlocked ? (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted">
                          <Lock className="size-2.5" /> {theme.requiredStreak}d
                        </span>
                      ) : selected ? (
                        <ShieldCheck className="size-3.5 text-accent" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10.5px] leading-snug text-muted">
                      {isVi ? theme.descriptionVi : theme.descriptionEn}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* 7-Day & 21-Day Focus Quests */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4 text-accent" />
            {isVi ? "Chiến dịch Thử thách (7 / 21 ngày)" : "Focus Quests (7 / 21 Days)"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {FOCUS_QUEST_CATALOG.map((tpl) => {
            const joined = activeKeys.has(tpl.key);
            const liveVal =
              tpl.key === "deep_work_10h"
                ? Math.min(tpl.targetValue, weeklyFocusMinutes)
                : Math.min(tpl.targetValue, bestStreak);
            const pct = Math.min(100, Math.round((liveVal / tpl.targetValue) * 100));

            return (
              <div
                key={tpl.key}
                className="rounded-xl border border-line bg-surface-2/40 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-semibold text-ink">
                      {isVi ? tpl.titleVi : tpl.titleEn}
                    </p>
                    <p className="text-[11px] text-muted">
                      {isVi ? tpl.descriptionVi : tpl.descriptionEn}
                    </p>
                  </div>
                  {joined ? (
                    <Badge tone={pct >= 100 ? "success" : "accent"}>
                      {pct >= 100
                        ? isVi
                          ? "Hoàn thành"
                          : "Completed"
                        : `${liveVal}/${tpl.targetValue} ${isVi ? tpl.unitVi : tpl.unitEn}`}
                    </Badge>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => handleJoinQuest(tpl.key)}
                    >
                      <Sparkles className="size-3" /> {isVi ? "Tham gia" : "Join"}
                    </Button>
                  )}
                </div>
                {joined && <Progress value={pct} className="mt-2 h-1.5" />}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
