"use client";

import { CheckCircle2, Film, Gamepad2, PlaySquare, Ticket } from "lucide-react";
import { useState, useTransition } from "react";
import { spendMinutesAction } from "@/lib/actions/rewards";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
import { formatMinutes } from "@/lib/data/format";
import type { Grant } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PASS_PRESETS = [
  { id: "yt15", label: "YouTube", minutes: 15, icon: PlaySquare, tone: "text-red-500" },
  { id: "game30", label: "Gaming", minutes: 30, icon: Gamepad2, tone: "text-indigo-500" },
  { id: "film45", label: "Show / Film", minutes: 45, icon: Film, tone: "text-amber-500" },
] as const;

export function QuickRedeemVault({
  grants,
  availableMinutes,
  dailyCapMinutes,
  earnedMinutes = 0,
  spentMinutes = 0,
}: {
  grants: Grant[];
  availableMinutes: number;
  dailyCapMinutes: number;
  earnedMinutes?: number;
  spentMinutes?: number;
}) {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [redeemedId, setRedeemedId] = useState<string | null>(null);

  const primaryGrant = grants.find((g) => g.remainingMinutes > 0) ?? null;
  const pct = Math.min(100, Math.round((availableMinutes / Math.max(1, dailyCapMinutes)) * 100));
  const ratioTotal = Math.max(1, earnedMinutes + spentMinutes);
  const earnedPct = Math.round((earnedMinutes / ratioTotal) * 100);
  const ringR = 20;
  const ringC = 2 * Math.PI * ringR;

  function redeemPreset(preset: (typeof PASS_PRESETS)[number]) {
    const grant = grants.find((g) => g.remainingMinutes >= preset.minutes) ?? primaryGrant;
    if (!grant || grant.remainingMinutes < preset.minutes) {
      toast.push(
        "error",
        isVi
          ? `Bạn cần ít nhất ${preset.minutes} phút khả dụng để đổi vé này.`
          : `You need at least ${preset.minutes}m available to redeem this pass.`,
      );
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("grantId", grant.id);
      fd.set("minutes", String(preset.minutes));
      fd.set("label", preset.label);
      const res = await spendMinutesAction(EMPTY_ACTION_STATE, fd);
      if (res.error) {
        toast.push("error", res.error);
      } else {
        setRedeemedId(preset.id);
        toast.push(
          "success",
          isVi
            ? `Đã đổi vé ${preset.label} (${preset.minutes} phút)!`
            : `Redeemed ${preset.label} (${preset.minutes}m) pass!`,
        );
        window.setTimeout(() => setRedeemedId(null), 3000);
      }
    });
  }

  return (
    <Card className="mt-5 overflow-hidden border-line bg-gradient-to-br from-surface via-surface to-surface-2">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-4 text-accent" />
            {isVi ? "Kho Vé Giải Trí Nhanh (Digital Pass Vault)" : "Quick-Redeem Pass Vault"}
          </CardTitle>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Đổi nhanh thời gian giải trí 1 chạm từ số dư ví thưởng đang có."
              : "One-tap leisure passes deducted directly from your active reward balance."}
          </p>
        </div>
        <span className="font-display text-[24px] leading-none tabular-nums text-ink">
          {formatMinutes(availableMinutes)}
        </span>
      </CardHeader>

      <CardContent className="space-y-4 pt-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
              <span>{isVi ? "Năng lượng Ví hôm nay" : "Wallet capacity"}</span>
              <span className="tabular-nums">
                {formatMinutes(availableMinutes)} / {formatMinutes(dailyCapMinutes)} ({pct}%)
              </span>
            </div>
            <Progress value={pct} tone="accent" className="h-2" />
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2">
            <svg viewBox="0 0 48 48" className="size-11 -rotate-90 shrink-0" aria-hidden>
              <circle cx="24" cy="24" r={ringR} fill="none" stroke="#d97706" strokeWidth="5" strokeOpacity="0.35" />
              <circle
                cx="24"
                cy="24"
                r={ringR}
                fill="none"
                stroke="#0d7a58"
                strokeWidth="5"
                strokeDasharray={`${(earnedPct / 100) * ringC} ${ringC}`}
              />
            </svg>
            <div className="text-[11px] leading-snug">
              <p className="font-semibold text-success">
                +{formatMinutes(earnedMinutes)} {isVi ? "kiếm" : "earned"}
              </p>
              <p className="text-warning">
                -{formatMinutes(spentMinutes)} {isVi ? "dùng" : "spent"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PASS_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const canAfford = grants.some((g) => g.remainingMinutes >= preset.minutes);
            const justRedeemed = redeemedId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={pending || !canAfford}
                onClick={() => redeemPreset(preset)}
                className={cn(
                  "group relative flex items-center justify-between rounded-2xl border border-dashed px-4 py-3.5 text-left transition-all",
                  justRedeemed
                    ? "border-success bg-success-soft/60"
                    : canAfford
                      ? "border-line bg-surface hover:border-accent/50 hover:bg-accent-soft/25 active:scale-[0.98]"
                      : "cursor-not-allowed border-line/60 bg-surface-2/50 opacity-55",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className={cn("flex size-9 items-center justify-center rounded-xl bg-surface-2", preset.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <p className="text-[13px] font-semibold text-ink">{preset.label}</p>
                    <p className="text-[11px] text-muted">
                      {justRedeemed
                        ? isVi
                          ? "ĐÃ ĐỔI THÀNH CÔNG"
                          : "REDEEMED"
                        : isVi
                          ? `Đổi ${preset.minutes} phút`
                          : `Redeem ${preset.minutes}m`}
                    </p>
                  </div>
                </div>
                {justRedeemed ? (
                  <CheckCircle2 className="size-5 text-success" />
                ) : (
                  <span className="rounded-full bg-surface-2 px-2.5 py-1 font-mono text-[11.5px] font-bold text-ink">
                    -{preset.minutes}m
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
