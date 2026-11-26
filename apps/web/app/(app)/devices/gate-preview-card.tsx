"use client";

import { Lock, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import type { BlockRuleRecord } from "@/lib/data/devices";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function GatePreviewCard({ rules }: { rules: BlockRuleRecord[] }) {
  const isVi = useLocale() === "vi";
  const blockedRules = rules.filter((r) => r.ruleType === "block" && r.isEnabled);
  const [selectedId, setSelectedId] = useState<string>(blockedRules[0]?.id ?? "");

  const activeRule =
    blockedRules.find((r) => r.id === selectedId) ?? blockedRules[0] ?? null;
  const targetLabel = activeRule?.displayName || activeRule?.identifier || "youtube.com";

  return (
    <Card className="overflow-hidden lg:sticky lg:top-6 lg:self-start">
      <CardHeader>
        <div>
          <CardTitle>{isVi ? "Xem trước Màn hình Khóa" : "Live Gate Preview"}</CardTitle>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Giao diện người dùng sẽ thấy khi mở trang/ứng dụng đang bị chặn."
              : "What appears when you open a blocked site or app before unlocking."}
          </p>
        </div>
        <ShieldAlert className="size-4 text-accent" />
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {blockedRules.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {blockedRules.slice(0, 6).map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => setSelectedId(rule.id)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                  (activeRule?.id ?? "") === rule.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface-2 text-muted hover:text-ink",
                )}
              >
                {rule.displayName || rule.identifier}
              </button>
            ))}
          </div>
        ) : null}

        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-[#1e1214] via-[#140d0e] to-[#0f0a0b] p-5 text-[#f5eeee] shadow-inner">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-accent/25 blur-2xl" />
          <div className="relative flex flex-col items-center text-center">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-accent/40 bg-accent/20 text-accent">
              <Lock className="size-5" />
            </span>
            <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-rose-300/80">
              FOCUSGATE · {isVi ? "ĐANG BẢO VỆ" : "GATE ACTIVE"}
            </p>
            <h3 className="mt-1.5 font-display text-[20px] leading-snug text-white">
              {isVi ? `${targetLabel} đang tạm khóa` : `${targetLabel} is paused`}
            </h3>
            <p className="mt-1.5 max-w-[240px] text-[11.5px] leading-relaxed text-white/70">
              {isVi
                ? "Hoàn thành các việc Bắt buộc hôm nay để tự động mở khóa và nhận phút thưởng giải trí."
                : "Finish today's Must-Do tasks to unlock the gate and earn guilt-free entertainment time."}
            </p>

            <div className="mt-4 flex w-full items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-3.5 py-1.5 text-[11px] font-semibold text-white">
                <Sparkles className="size-3" />
                {isVi ? "Quay lại tập trung" : "Back to Focus"}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
