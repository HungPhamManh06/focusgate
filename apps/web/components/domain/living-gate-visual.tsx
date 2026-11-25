import type { PlanStatus } from "@/lib/data/types";
import { cn } from "@/lib/utils";

export function LivingGateVisual({
  status,
  mustDoCompleted,
  mustDoTotal,
  isUnlocked,
  locale = "en",
}: {
  status: PlanStatus | null;
  mustDoCompleted: number;
  mustDoTotal: number;
  isUnlocked: boolean;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const isDraft = status === "draft" || status === null;
  const open = isUnlocked || status === "completed";
  const percent = mustDoTotal > 0 ? Math.min(100, Math.round((mustDoCompleted / mustDoTotal) * 100)) : 0;

  // Compute lock-pin dots evenly spaced along the upper arch (from 195deg to -15deg)
  const pinCount = Math.min(Math.max(mustDoTotal, 0), 10);
  const completedPins =
    mustDoTotal > 0 ? Math.round((mustDoCompleted / mustDoTotal) * pinCount) : 0;
  const pins = Array.from({ length: pinCount }, (_, idx) => {
    const t = pinCount === 1 ? 0.5 : idx / (pinCount - 1);
    const angleDeg = 180 - t * 180;
    const rad = (angleDeg * Math.PI) / 180;
    const cx = 80 + Math.cos(rad) * 52;
    const cy = 78 - Math.sin(rad) * 52;
    return { cx, cy, lit: open || idx < completedPins };
  });

  // Outer arch path length ~ 292
  const archLength = 292;
  const dashOffset = archLength * (1 - (open ? 1 : percent / 100));

  return (
    <div
      className="flex flex-col items-center"
      role="img"
      aria-label={
        open
          ? isVi
            ? "Cổng FocusGate đã mở khóa"
            : "FocusGate unlocked"
          : isVi
            ? `Cổng FocusGate: đã hoàn thành ${mustDoCompleted} trên ${mustDoTotal} việc Bắt buộc`
            : `FocusGate: ${mustDoCompleted} of ${mustDoTotal} must-do tasks completed`
      }
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-2xl border px-3.5 py-3 transition-colors",
          open
            ? "border-success/35 bg-gradient-to-b from-success-soft/80 via-surface to-surface shadow-[0_8px_28px_-14px_rgba(13,122,88,0.45)]"
            : isDraft
              ? "border-dashed border-line bg-surface-2/60"
              : "border-accent/25 bg-gradient-to-b from-[#1e1415] via-[#171112] to-[#261213] text-[#faf7f5] shadow-[0_12px_32px_-16px_rgba(185,28,28,0.4)]",
        )}
      >
        <svg viewBox="0 0 160 154" className="h-[138px] w-[144px] overflow-visible" fill="none">
          <defs>
            <radialGradient id="fg-living-glow" cx="80" cy="74" r="56" gradientUnits="userSpaceOnUse">
              <stop
                offset="0"
                stopColor={open ? "#10b981" : "#dc2626"}
                stopOpacity={open ? "0.34" : isDraft ? "0.08" : "0.28"}
              />
              <stop offset="1" stopColor={open ? "#10b981" : "#dc2626"} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Ambient glow inside arch */}
          <circle
            cx="80"
            cy="78"
            r="56"
            fill="url(#fg-living-glow)"
            className={open ? "fg-animate-gate" : undefined}
          />

          {/* Base track arch */}
          <path
            d="M28 134V78a52 52 0 0 1 104 0v56"
            stroke={open ? "rgba(13,122,88,0.22)" : isDraft ? "var(--line)" : "rgba(250,247,245,0.16)"}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={isDraft ? "5 6" : undefined}
          />

          {/* Progress arch */}
          {!isDraft ? (
            <path
              d="M28 134V78a52 52 0 0 1 104 0v56"
              stroke={open ? "var(--success)" : "#ef4444"}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={archLength}
              strokeDashoffset={dashOffset}
              style={{ transition: "stroke-dashoffset 600ms ease" }}
            />
          ) : null}

          {/* Inner gate portal (parts open when unlocked) */}
          {open ? (
            <>
              <path
                d="M52 134v-28c0-15 11-26 24-28"
                stroke="var(--success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.7"
              />
              <path
                d="M108 134v-28c0-15-11-26-24-28"
                stroke="var(--success)"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.7"
              />
            </>
          ) : (
            <path
              d="M56 134v-27a24 24 0 0 1 48 0v27"
              stroke={isDraft ? "var(--line)" : "rgba(250,247,245,0.26)"}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}

          {/* Ground threshold bar */}
          <path
            d="M20 134h120"
            stroke={open ? "var(--success)" : isDraft ? "var(--line)" : "rgba(250,247,245,0.35)"}
            strokeWidth="3"
            strokeLinecap="round"
          />

          {/* Keystone dot */}
          <circle
            cx="80"
            cy="46"
            r="4.5"
            fill={open ? "var(--success)" : isDraft ? "var(--muted)" : "#ef4444"}
          />

          {/* Individual Must-do lock pins */}
          {pins.map((pin, idx) => (
            <circle
              key={idx}
              cx={pin.cx}
              cy={pin.cy}
              r={pin.lit ? 4.2 : 3.2}
              fill={
                pin.lit
                  ? open
                    ? "#10b981"
                    : "#fbbf24"
                  : isDraft
                    ? "var(--surface)"
                    : "#3b2325"
              }
              stroke={pin.lit ? "#ffffff" : isDraft ? "var(--muted)" : "rgba(250,247,245,0.45)"}
              strokeWidth="1.4"
            />
          ))}

          {/* Center readout */}
          <text
            x="80"
            y="95"
            textAnchor="middle"
            className="font-display tabular-nums"
            fill={open ? "var(--ink)" : isDraft ? "var(--ink)" : "#faf7f5"}
            fontSize="27"
            fontWeight="500"
          >
            {mustDoCompleted}/{mustDoTotal}
          </text>
          <text
            x="80"
            y="114"
            textAnchor="middle"
            fill={open ? "var(--success)" : isDraft ? "var(--muted)" : "rgba(250,247,245,0.72)"}
            fontSize="9.5"
            fontWeight="700"
            letterSpacing="1.6"
          >
            {open
              ? isVi
                ? "ĐÃ MỞ CỔNG"
                : "GATE OPEN"
              : isDraft
                ? isVi
                  ? "BẢN NHÁP"
                  : "DRAFT GATE"
                : isVi
                  ? "BẮT BUỘC"
                  : "MUST-DO"}
          </text>
        </svg>
      </div>

      <p
        className={cn(
          "mt-2 text-[11px] font-medium tabular-nums",
          open ? "text-success" : "text-muted",
        )}
      >
        {open
          ? isVi
            ? "Tự do giải trí đã mở"
            : "Leisure time unlocked"
          : isDraft
            ? isVi
              ? "Sẵn sàng khóa cổng"
              : "Ready to lock gate"
            : isVi
              ? `Hoàn thành ${percent}% cổng hôm nay`
              : `${percent}% of today's gate`}
      </p>
    </div>
  );
}
