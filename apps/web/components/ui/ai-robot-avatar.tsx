"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type RobotMood = "idle" | "listening" | "thinking" | "success" | "error";

interface AiRobotAvatarProps {
  size?: number;
  mood?: RobotMood;
  className?: string;
}

/**
 * GateBot — Friendly FocusGate Companion Robot SVG Avatar.
 * Warm ceramic arch-head + obsidian glass visor + 5 expressive animated moods.
 */
export function AiRobotAvatar({
  size = 36,
  mood = "idle",
  className,
}: AiRobotAvatarProps) {
  const uid = useId().replace(/:/g, "");
  const shellGradId = `gb-shell-${uid}`;
  const visorGradId = `gb-visor-${uid}`;
  const eyeGlowId = `gb-glow-${uid}`;

  const antennaColor =
    mood === "success"
      ? "#34d399"
      : mood === "listening"
        ? "#f43f5e"
        : mood === "thinking"
          ? "#f59e0b"
          : mood === "error"
            ? "#fb923c"
            : "var(--accent, #b91c1c)";

  const eyeColor =
    mood === "success"
      ? "#6ee7b7"
      : mood === "listening"
        ? "#fda4af"
        : mood === "thinking"
          ? "#fde68a"
          : mood === "error"
            ? "#fdba74"
            : "#fef2f2";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center select-none",
        mood === "idle" && "fg-robot-float",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id={shellGradId} x1="12" y1="10" x2="52" y2="58" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#fffaf8" />
            <stop offset="55%" stopColor="#f2e9e6" />
            <stop offset="100%" stopColor="#dcd0cc" />
          </linearGradient>
          <linearGradient id={visorGradId} x1="16" y1="24" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#261d21" />
            <stop offset="100%" stopColor="#0f0b0d" />
          </linearGradient>
          <filter id={eyeGlowId} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Listening side audio waves */}
        {mood === "listening" && (
          <g stroke={antennaColor} strokeWidth="2.2" strokeLinecap="round" opacity="0.85">
            <path d="M5 32v6" className="fg-robot-wave" />
            <path d="M9 28v14" className="fg-robot-wave" style={{ animationDelay: "120ms" }} />
            <path d="M55 28v14" className="fg-robot-wave" style={{ animationDelay: "180ms" }} />
            <path d="M59 32v6" className="fg-robot-wave" style={{ animationDelay: "60ms" }} />
          </g>
        )}

        {/* Thinking orbiting sparkles */}
        {mood === "thinking" && (
          <g fill="#f59e0b">
            <circle cx="15" cy="11" r="2.1" className="animate-pulse" />
            <circle cx="49" cy="11" r="1.8" className="animate-pulse" style={{ animationDelay: "200ms" }} />
            <circle cx="32" cy="4" r="1.5" className="animate-pulse" style={{ animationDelay: "400ms" }} />
          </g>
        )}

        {/* Success celebration sparkles */}
        {mood === "success" && (
          <g fill="#34d399">
            <path d="M12 10l1.4 3.2L16.6 14.6 13.4 16 12 19.2 10.6 16 7.4 14.6l3.2-1.4z" className="animate-pulse" />
            <path d="M52 11l1.1 2.4 2.4 1.1-2.4 1.1-1.1 2.4-1.1-2.4-2.4-1.1 2.4-1.1z" className="animate-pulse" style={{ animationDelay: "180ms" }} />
          </g>
        )}

        {/* Antenna stem + glowing bulb */}
        <line x1="32" y1="10" x2="32" y2="17" stroke="#b8a8a3" strokeWidth="2.4" strokeLinecap="round" />
        <circle
          cx="32"
          cy="8.5"
          r="3.6"
          fill={antennaColor}
          className={mood === "listening" || mood === "thinking" ? "animate-pulse" : undefined}
        />
        <circle cx="30.8" cy="7.3" r="1.1" fill="#ffffff" opacity="0.7" />

        {/* Cute rounded ears */}
        <rect x="7" y="29" width="5.5" height="13" rx="2.75" fill="#d8cbc7" stroke="#b9a9a4" strokeWidth="1" />
        <rect x="51.5" y="29" width="5.5" height="13" rx="2.75" fill="#d8cbc7" stroke="#b9a9a4" strokeWidth="1" />

        {/* Ceramic arch-contoured robot head */}
        <rect
          x="11.5"
          y="16.5"
          width="41"
          height="38"
          rx="16.5"
          fill={`url(#${shellGradId})`}
          stroke="#c9bbb7"
          strokeWidth="1.5"
        />

        {/* Subtle FocusGate arch detail on forehead */}
        <path
          d="M25 22.5 C25 19.8 39 19.8 39 22.5"
          stroke={antennaColor}
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.55"
        />

        {/* Obsidian dark glass visor */}
        <rect
          x="16"
          y="25"
          width="32"
          height="21.5"
          rx="9.5"
          fill={`url(#${visorGradId})`}
        />
        {/* Subtle glass sheen */}
        <path
          d="M21 27.5 H33"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.18"
        />

        {/* Expressive Eyes + Mouth */}
        <g filter={`url(#${eyeGlowId})`}>
          {mood === "success" ? (
            <>
              {/* Happy ^ ^ arched eyes */}
              <path
                d="M21.5 35.5 Q25 30.8 28.5 35.5"
                stroke={eyeColor}
                strokeWidth="2.6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M35.5 35.5 Q39 30.8 42.5 35.5"
                stroke={eyeColor}
                strokeWidth="2.6"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M28.5 40.5 Q32 43.8 35.5 40.5"
                stroke={eyeColor}
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
              />
            </>
          ) : mood === "listening" ? (
            <>
              {/* Attentive wide glowing eyes */}
              <circle cx="25" cy="34.5" r="3.4" fill={eyeColor} />
              <circle cx="39" cy="34.5" r="3.4" fill={eyeColor} />
              <circle cx="26" cy="33.5" r="1.1" fill="#ffffff" />
              <circle cx="40" cy="33.5" r="1.1" fill="#ffffff" />
              {/* Small attentive o-smile */}
              <circle cx="32" cy="41" r="1.8" fill={eyeColor} opacity="0.9" />
            </>
          ) : mood === "thinking" ? (
            <>
              {/* Playful focused eyes glancing upward */}
              <ellipse cx="25" cy="33.5" rx="2.7" ry="3.1" fill={eyeColor} />
              <ellipse cx="39" cy="33.5" rx="2.7" ry="3.1" fill={eyeColor} />
              <circle cx="26.2" cy="32.2" r="0.9" fill="#ffffff" />
              <circle cx="40.2" cy="32.2" r="0.9" fill="#ffffff" />
              <path
                d="M29 41.2 H35"
                stroke={eyeColor}
                strokeWidth="1.9"
                strokeLinecap="round"
                opacity="0.85"
              />
            </>
          ) : mood === "error" ? (
            <>
              {/* Gentle concerned eyes */}
              <circle cx="25" cy="35" r="2.6" fill={eyeColor} />
              <circle cx="39" cy="35" r="2.6" fill={eyeColor} />
              <path
                d="M28.5 42 Q32 39.8 35.5 42"
                stroke={eyeColor}
                strokeWidth="1.9"
                strokeLinecap="round"
                fill="none"
              />
            </>
          ) : (
            <>
              {/* Idle friendly blinking eyes + warm smile */}
              <g className="fg-robot-blink" style={{ transformOrigin: "32px 34.5px" }}>
                <rect x="22.3" y="31.3" width="5.4" height="6.4" rx="2.7" fill={eyeColor} />
                <rect x="36.3" y="31.3" width="5.4" height="6.4" rx="2.7" fill={eyeColor} />
                <circle cx="23.9" cy="33" r="1" fill="#ffffff" opacity="0.9" />
                <circle cx="37.9" cy="33" r="1" fill="#ffffff" opacity="0.9" />
              </g>
              <path
                d="M28.8 40.8 Q32 43.4 35.2 40.8"
                stroke={eyeColor}
                strokeWidth="1.9"
                strokeLinecap="round"
                fill="none"
                opacity="0.92"
              />
            </>
          )}
        </g>

        {/* Soft rosy cheeks for extra friendliness */}
        <circle cx="19.5" cy="39.5" r="1.6" fill="#fda4af" opacity="0.45" />
        <circle cx="44.5" cy="39.5" r="1.6" fill="#fda4af" opacity="0.45" />
      </svg>
    </span>
  );
}
