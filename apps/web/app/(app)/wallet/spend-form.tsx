"use client";

import { Loader2, MinusCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { spendMinutesAction } from "@/lib/actions/rewards";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
import { formatDate, formatMinutes } from "@/lib/data/format";
import type { Grant } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const QUICK_MINUTES = [10, 15, 30] as const;
const QUICK_SOURCES = ["YouTube", "Gaming", "Social", "Show / Film"] as const;

export function SpendForm({ grants, timezone }: { grants: Grant[]; timezone: string }) {
  const locale = useLocale();
  const isVi = locale === "vi";
  const [state, formAction, pending] = useActionState(spendMinutesAction, EMPTY_ACTION_STATE);
  const [grantId, setGrantId] = useState(grants[0]?.id ?? "");
  const [minutes, setMinutes] = useState(15);
  const [label, setLabel] = useState("");
  const [frictionSlider, setFrictionSlider] = useState(0);
  const toast = useToast();

  useEffect(() => {
    if (state.success) {
      toast.push("success", state.success);
      setLabel("");
      setMinutes(15);
      setFrictionSlider(0);
    } else if (state.error) {
      toast.push("error", state.error);
    }
  }, [state, toast]);

  useEffect(() => {
    if (!grants.some((grant) => grant.id === grantId)) setGrantId(grants[0]?.id ?? "");
  }, [grants, grantId]);

  if (grants.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        {isVi
          ? "Chưa có phần thưởng nào đang hiệu lực. Hoàn thành kế hoạch ngày để nhận thời gian giải trí."
          : "No active grant to spend. Finish a plan to earn your next block of time."}
      </p>
    );
  }

  const selected = grants.find((grant) => grant.id === grantId);
  const maxMinutes = Math.max(1, selected?.remainingMinutes ?? 1);
  const clampedMinutes = Math.max(1, Math.min(minutes || 0, maxMinutes));

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="spend-grant">{isVi ? "Từ gói thưởng" : "From grant"}</Label>
        <Select
          id="spend-grant"
          name="grantId"
          value={grantId}
          onChange={(event) => setGrantId(event.target.value)}
        >
          {grants.map((grant) => (
            <option key={grant.id} value={grant.id}>
              {isVi
                ? `còn ${formatMinutes(grant.remainingMinutes)} · hết hạn ${formatDate(grant.expiresAt, { month: "short", day: "numeric" }, timezone, locale)}`
                : `${formatMinutes(grant.remainingMinutes)} left · expires ${formatDate(grant.expiresAt, { month: "short", day: "numeric" }, timezone)}`}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label htmlFor="spend-minutes" className="mb-0">
            {isVi ? "Số phút" : "Minutes"}
          </Label>
          <div className="flex items-center gap-1" role="group" aria-label="Quick duration presets">
            {QUICK_MINUTES.filter((preset) => preset < maxMinutes).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setMinutes(preset)}
                aria-pressed={minutes === preset}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10.5px] font-medium tabular-nums transition-colors",
                  minutes === preset
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-line bg-surface-2/60 text-muted hover:text-ink",
                )}
              >
                {preset}m
              </button>
            ))}
            <button
              type="button"
              onClick={() => setMinutes(maxMinutes)}
              aria-pressed={minutes === maxMinutes}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10.5px] font-medium tabular-nums transition-colors",
                minutes === maxMinutes
                  ? "border-accent/40 bg-accent-soft text-accent"
                  : "border-line bg-surface-2/60 text-muted hover:text-ink",
              )}
            >
              {isVi ? `Tối đa (${maxMinutes}m)` : `Max (${maxMinutes}m)`}
            </button>
          </div>
        </div>
        <Input
          id="spend-minutes"
          name="minutes"
          type="number"
          min={1}
          max={maxMinutes}
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value))}
          required
        />
      </div>

      <div>
        <Label htmlFor="spend-label">{isVi ? "Dùng cho việc gì?" : "What for?"}</Label>
        <Input
          id="spend-label"
          name="label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={isVi ? "YouTube, game, mạng xã hội…" : "YouTube, gaming, social…"}
          maxLength={120}
          required
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {QUICK_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => setLabel(source)}
              aria-pressed={label === source}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[10.5px] transition-colors",
                label === source
                  ? "border-accent/40 bg-accent-soft font-medium text-accent"
                  : "border-line bg-surface-2/50 text-muted hover:text-ink",
              )}
            >
              {source}
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted">
        {isVi
          ? `Tối đa ${formatMinutes(maxMinutes)} cho gói này. Khi dùng sẽ ghi nhận ngay và không thể hoàn tác.`
          : `Max ${formatMinutes(maxMinutes)} on this grant. Spending records a usage event and is final.`}
      </p>

      <div className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-ink-soft">
            {isVi ? "Kéo xác nhận chi tiêu có chủ đích" : "Slide to confirm mindful spend"}
          </span>
          <span className="font-mono text-muted tabular-nums">
            {isVi
              ? `Còn lại: ${formatMinutes(Math.max(0, maxMinutes - clampedMinutes))}`
              : `After spend: ${formatMinutes(Math.max(0, maxMinutes - clampedMinutes))}`}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={frictionSlider}
          onChange={(e) => setFrictionSlider(Number(e.target.value))}
          aria-label={isVi ? "Kéo xác nhận chi tiêu" : "Slide to confirm spend"}
          className="w-full accent-[var(--accent)]"
        />
      </div>

      <Button
        type="submit"
        variant="primary"
        disabled={pending || frictionSlider < 85}
        className="w-full"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <MinusCircle className="size-4" />}
        {frictionSlider < 85
          ? isVi
            ? "Kéo thanh trượt để mở khóa nút dùng"
            : "Slide bar to unlock spend"
          : isVi
            ? `Dùng ${clampedMinutes} phút`
            : `Spend ${clampedMinutes} min`}
      </Button>
    </form>
  );
}
