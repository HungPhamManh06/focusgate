import { useId } from "react";

interface AiLogoMarkProps {
  size?: number;
  thinking?: boolean;
  listening?: boolean;
  className?: string;
}

/**
 * FocusGate AI — Concept 1: Keystone Spark
 * Double FocusGate discipline arch crowned by a glowing crimson 4-point AI star.
 */
export function AiLogoMark({
  size = 28,
  thinking = false,
  listening = false,
  className = "",
}: AiLogoMarkProps) {
  const uid = useId().replace(/:/g, "");
  const bgId = `fg-ai-bg-${uid}`;
  const glowId = `fg-ai-glow-${uid}`;
  const sparkId = `fg-ai-spark-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id={bgId} x1="6" y1="6" x2="58" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#261515" />
          <stop offset="55%" stopColor="#141212" />
          <stop offset="100%" stopColor="#2D1010" />
        </linearGradient>
        <radialGradient id={glowId} cx="32" cy="18" r="22" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EF4444" stopOpacity={listening ? "0.75" : "0.5"} />
          <stop offset="55%" stopColor="#DC2626" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#DC2626" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sparkId} x1="32" y1="9" x2="32" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFF1F2" />
          <stop offset="45%" stopColor="#FCA5A5" />
          <stop offset="100%" stopColor="#DC2626" />
        </linearGradient>
      </defs>

      {/* Dark espresso squircle */}
      <rect
        x="2"
        y="2"
        width="60"
        height="60"
        rx="16"
        fill={`url(#${bgId})`}
        stroke={listening ? "#EF4444" : "#3F2A2A"}
        strokeWidth={listening ? "2" : "1.5"}
      />

      {/* Crimson apex aura */}
      <circle cx="32" cy="19" r="22" fill={`url(#${glowId})`} />

      {/* Outer FocusGate arch */}
      <path
        d="M17 49V32C17 23.716 23.716 17 32 17C40.284 17 47 23.716 47 32V49"
        stroke="#FAF7F5"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Inner FocusGate arch */}
      <path
        d="M24 49V33C24 28.582 27.582 25 32 25C36.418 25 40 28.582 40 33V49"
        stroke="#FAF7F5"
        strokeOpacity="0.72"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* Center vertical discipline pillar */}
      <path
        d="M32 34V49"
        stroke="#DC2626"
        strokeOpacity="0.7"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* Keystone 4-point AI spark at apex */}
      <path
        d="M32 7.5C32.85 13.6 34.4 15.15 40.5 16C34.4 16.85 32.85 18.4 32 24.5C31.15 18.4 29.6 16.85 23.5 16C29.6 15.15 31.15 13.6 32 7.5Z"
        fill={`url(#${sparkId})`}
        className={thinking || listening ? "animate-pulse" : undefined}
      />

      {/* Listening pulse ring */}
      {listening && (
        <circle
          cx="32"
          cy="16"
          r="11"
          stroke="#EF4444"
          strokeOpacity="0.55"
          strokeWidth="1.5"
          className="animate-ping"
        />
      )}
    </svg>
  );
}
