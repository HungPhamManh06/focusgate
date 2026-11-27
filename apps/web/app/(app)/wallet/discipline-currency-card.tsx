import { formatMinutes } from "@/lib/data/format";

interface DisciplineCurrencyCardProps {
  availableMinutes: number;
  earnedMinutes: number;
  consumedMinutes: number;
  displayName: string;
  locale: "en" | "vi";
}

/**
 * FocusGate 14.0: Metallic Espresso / Emerald Discipline Currency Card for /wallet.
 */
export function DisciplineCurrencyCard({
  availableMinutes,
  earnedMinutes,
  consumedMinutes,
  displayName,
  locale,
}: DisciplineCurrencyCardProps) {
  const isVi = locale === "vi";
  const hasBalance = availableMinutes > 0;
  const totalFlow = Math.max(1, earnedMinutes);
  const remainingPct = Math.min(100, Math.round((availableMinutes / totalFlow) * 100));

  return (
    <section
      className="spotlight-card gate-tilt-card relative mt-6 overflow-hidden rounded-[22px] border border-white/10 p-6 text-white shadow-lift"
      style={{
        background: hasBalance
          ? "linear-gradient(135deg, #10251e 0%, #0d1916 50%, #17372b 100%)"
          : "linear-gradient(135deg, #241416 0%, #141011 52%, #2d1215 100%)",
      }}
      aria-label={isVi ? "Thẻ ví kỷ luật FocusGate" : "FocusGate Discipline Currency Card"}
    >
      {/* Subtle diagonal sheen */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-12 -top-12 size-48 rounded-full blur-3xl"
        style={{
          background: hasBalance ? "rgba(52, 211, 153, 0.24)" : "rgba(244, 63, 94, 0.22)",
        }}
      />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.2em] text-white/60">
            FOCUSGATE · {isVi ? "THẺ THỜI GIAN TỰ DO" : "DISCIPLINE CURRENCY"}
          </p>
          <p className="mt-2 font-display text-[42px] font-semibold leading-none tracking-tight tabular-nums sm:text-[48px]">
            {formatMinutes(availableMinutes)}
          </p>
          <p className="mt-1.5 text-[12px] text-white/70">
            {hasBalance
              ? isVi
                ? "Số dư khả dụng sẵn sàng đổi thành thời gian giải trí có chủ đích."
                : "Available balance ready to spend on guilt-free leisure."
              : isVi
                ? "Hoàn thành phiên tập trung hoặc kế hoạch ngày để nạp phút vào thẻ."
                : "Complete a focus session or daily plan to mint earned minutes."}
          </p>
        </div>

        <div className="min-w-[210px] space-y-2 rounded-2xl border border-white/10 bg-black/25 p-3.5 backdrop-blur-sm">
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <span>{isVi ? "Đã kiếm" : "Earned"}</span>
            <span className="font-semibold text-white tabular-nums">{formatMinutes(earnedMinutes)}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-white/70">
            <span>{isVi ? "Đã dùng" : "Spent"}</span>
            <span className="font-semibold text-white/85 tabular-nums">{formatMinutes(consumedMinutes)}</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${remainingPct}%`,
                background: hasBalance ? "#34d399" : "#f43f5e",
              }}
            />
          </div>
          <div className="flex items-center justify-between pt-0.5 text-[10px] uppercase tracking-[0.14em] text-white/50">
            <span>{displayName}</span>
            <span>{remainingPct}% {isVi ? "còn lại" : "left"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
