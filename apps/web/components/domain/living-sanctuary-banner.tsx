"use client";

import { Moon, Sun, Sunrise, Sunset } from "lucide-react";
import { useEffect, useState } from "react";
import { getGateThemeSpec, type GateThemeId } from "@/lib/domain/gate-themes";

type TimePhase = "dawn" | "midday" | "evening" | "bedtime";

function resolvePhase(hour: number): TimePhase {
  if (hour >= 6 && hour < 11) return "dawn";
  if (hour >= 11 && hour < 18) return "midday";
  if (hour >= 18 && hour < 23) return "evening";
  return "bedtime";
}

export function LivingSanctuaryBanner({
  mustDoCompleted,
  mustDoTotal,
  isUnlocked,
  themeId = "stone",
  locale = "en",
}: {
  mustDoCompleted: number;
  mustDoTotal: number;
  isUnlocked: boolean;
  themeId?: GateThemeId;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [phase, setPhase] = useState<TimePhase>("midday");

  useEffect(() => {
    setPhase(resolvePhase(new Date().getHours()));
  }, []);

  const theme = getGateThemeSpec(themeId);
  const progress = isUnlocked
    ? 1
    : mustDoTotal > 0
      ? Math.max(0, Math.min(1, mustDoCompleted / mustDoTotal))
      : 0;
  // Physical door parting offset (0px sealed -> 24px wide open)
  const doorOffset = Math.round(progress * 24);

  const skyGradient =
    isUnlocked
      ? "linear-gradient(110deg, #0b241d 0%, #12382c 52%, #1d4d3d 100%)"
      : phase === "dawn"
        ? "linear-gradient(110deg, #2b1517 0%, #4a231c 55%, #7c3a21 100%)"
        : phase === "midday"
          ? "linear-gradient(110deg, #1f1315 0%, #2d1619 52%, #3f1a1e 100%)"
          : phase === "evening"
            ? "linear-gradient(110deg, #140d18 0%, #23121c 52%, #35151a 100%)"
            : "linear-gradient(110deg, #0b0a12 0%, #13101d 55%, #1d1522 100%)";

  const phaseLabel =
    phase === "dawn"
      ? isVi
        ? "Bình minh khởi động"
        : "Dawn Sanctuary"
      : phase === "midday"
        ? isVi
          ? "Khung giờ tập trung"
          : "Midday Focus"
        : phase === "evening"
          ? isVi
            ? "Đêm tĩnh tại"
            : "Evening Sanctuary"
          : isVi
            ? "Giờ Ngủ bảo vệ"
            : "Bedtime Gate";

  const PhaseIcon =
    phase === "dawn" ? Sunrise : phase === "midday" ? Sun : phase === "evening" ? Sunset : Moon;

  return (
    <div
      className="relative flex h-[92px] w-full items-center justify-between overflow-hidden border-b border-line px-5 text-[#faf7f5] sm:px-7"
      style={{ background: skyGradient }}
    >
      {/* Subtle stars / horizon light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "radial-gradient(circle at 50% 90%, " +
            (isUnlocked ? "rgba(52,211,153,0.45)" : theme.glowHex) +
            ", transparent 60%)",
        }}
      />

      <div className="relative z-10 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-full bg-white/10 backdrop-blur-xs">
          <PhaseIcon className="size-4 text-[#fde68a]" />
        </span>
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/70">
            {phaseLabel} · {isVi ? theme.nameVi : theme.nameEn}
          </p>
          <p className="text-[13px] font-semibold text-white">
            {isUnlocked
              ? isVi
                ? "Cánh cổng đã mở toang — Chào mừng tự do!"
                : "The Gate stands open — Welcome to earned freedom!"
              : mustDoTotal > 0
                ? isVi
                  ? `Cánh cổng đang hé mở ${Math.round(progress * 100)}% (${mustDoCompleted}/${mustDoTotal} việc)`
                  : `Gate parting ${Math.round(progress * 100)}% (${mustDoCompleted}/${mustDoTotal} tasks)`
                : isVi
                  ? "Chốt việc Bắt buộc để dựng cổng hôm nay"
                  : "Commit Must-Do tasks to raise today's gate"}
          </p>
        </div>
      </div>

      {/* Parting Gate Doors Miniature SVG */}
      <svg
        aria-hidden
        viewBox="0 0 120 76"
        className="relative z-10 hidden h-[74px] w-[116px] shrink-0 sm:block"
        fill="none"
      >
        {/* Horizon light beam behind parting doors */}
        <path
          d="M28 72V38a32 32 0 0 1 64 0v34H28Z"
          fill={isUnlocked ? "rgba(52,211,153,0.35)" : "rgba(251,191,36,0.22)"}
        />
        {/* Left Gate Door */}
        <rect
          x={28 - doorOffset}
          y="22"
          width="32"
          height="50"
          rx="3"
          fill="#1b1113"
          stroke={isUnlocked ? "#34d399" : theme.accentHex}
          strokeWidth="1.5"
          style={{ transition: "x 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        {/* Right Gate Door */}
        <rect
          x={60 + doorOffset}
          y="22"
          width="32"
          height="50"
          rx="3"
          fill="#1b1113"
          stroke={isUnlocked ? "#34d399" : theme.accentHex}
          strokeWidth="1.5"
          style={{ transition: "x 700ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
        {/* Outer Arch Frame */}
        <path
          d="M24 72V38a36 36 0 0 1 72 0v34"
          stroke={isUnlocked ? "#34d399" : "rgba(255,255,255,0.75)"}
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path d="M12 72h96" stroke="rgba(255,255,255,0.4)" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    </div>
  );
}
