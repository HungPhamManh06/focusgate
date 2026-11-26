"use client";

import { Maximize2, Minimize2, NotebookPen, Quote, RefreshCw, Wind, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

const MANTRAS_VI = [
  "Kỷ luật là chọn điều bạn thực sự muốn thay vì điều bạn muốn ngay lúc này.",
  "Một giờ tập trung sâu giá trị hơn cả ngày phân tâm.",
  "Hoàn thành việc khó trước, sự tự do sẽ ngọt ngào hơn gấp bội.",
  "Sự bình tĩnh sinh ra từ việc làm chủ sự chú ý của chính mình.",
];

const MANTRAS_EN = [
  "Discipline is choosing what you want most over what you want now.",
  "One hour of deep focus outweighs a full day of shallow motion.",
  "Finish the hard thing first; earned freedom tastes twice as sweet.",
  "Calm comes from commanding your own attention.",
];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function FocusSanctuaryTools({ darkSurface = true }: { darkSurface?: boolean }) {
  const isVi = useLocale() === "vi";
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scratchOpen, setScratchOpen] = useState(false);
  const [breathingOpen, setBreathingOpen] = useState(false);
  const [scratchText, setScratchText] = useState("");
  const [breathPhase, setBreathPhase] = useState<0 | 1 | 2>(0); // 0=Inhale, 1=Hold, 2=Exhale
  const [mantraIdx, setMantraIdx] = useState(0);
  const [showMantra, setShowMantra] = useState(true);

  const todayKey = `focusgate:scratchpad:${new Date().toISOString().slice(0, 10)}`;

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(todayKey);
      if (saved) setScratchText(saved);
    } catch {
      // ignore
    }
  }, [todayKey]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        void toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!breathingOpen) return;
    const timer = window.setInterval(() => {
      setBreathPhase((p) => ((p + 1) % 3) as 0 | 1 | 2);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [breathingOpen]);

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen not supported or blocked
    }
  }

  function updateScratch(next: string) {
    setScratchText(next);
    try {
      window.localStorage.setItem(todayKey, next);
    } catch {
      // ignore
    }
  }

  const phaseLabel =
    breathPhase === 0
      ? isVi
        ? "Hít vào chậm (4s)"
        : "Inhale slowly (4s)"
      : breathPhase === 1
        ? isVi
          ? "Giữ hơi thở (4s)"
          : "Hold gently (4s)"
        : isVi
          ? "Thở ra hết (4s)"
          : "Exhale fully (4s)";

  const btnClass = darkSurface
    ? "border-white/15 bg-white/10 text-white/85 hover:bg-white/20"
    : "border-line bg-surface text-ink-soft hover:border-accent/40 hover:text-ink";

  return (
    <div className="mt-3 flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
            btnClass,
          )}
        >
          {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          {isFullscreen
            ? isVi
              ? "Thoát toàn màn hình"
              : "Exit fullscreen"
            : isVi
              ? "Toàn màn hình (F)"
              : "Sanctuary (F)"}
        </button>

        <button
          type="button"
          onClick={() => setScratchOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
            scratchOpen ? "border-accent bg-accent text-white" : btnClass,
          )}
        >
          <NotebookPen className="size-3.5" />
          {isVi ? "Giấy nháp nhanh" : "Brain-dump pad"}
        </button>

        <button
          type="button"
          onClick={() => setBreathingOpen((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] font-medium transition-colors",
            breathingOpen ? "border-emerald-400 bg-emerald-600 text-white" : btnClass,
          )}
        >
          <Wind className="size-3.5" />
          {isVi ? "Nhịp thở 4-4-4" : "4-4-4 Breath"}
        </button>
      </div>

      {scratchOpen ? (
        <div className="fg-animate-in w-full max-w-md rounded-2xl border border-white/15 bg-black/45 p-3.5 text-left text-white backdrop-blur-md">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/70">
              {isVi ? "Ghi nhanh để không phân tâm" : "Distraction scratchpad"}
            </span>
            <button
              type="button"
              onClick={() => setScratchOpen(false)}
              className="rounded p-0.5 text-white/60 hover:text-white"
              aria-label="Close scratchpad"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <textarea
            value={scratchText}
            onChange={(e) => updateScratch(e.target.value)}
            rows={3}
            placeholder={
              isVi
                ? "Ý tưởng chợt nảy ra? Ghi xuống đây rồi quay lại tập trung tiếp..."
                : "Random thought popped up? Park it here and stay locked in..."
            }
            className="w-full resize-none rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[12.5px] text-white placeholder:text-white/40 focus:border-accent focus:outline-none"
          />
        </div>
      ) : null}

      {breathingOpen ? (
        <div className="fg-animate-in flex flex-col items-center gap-2 rounded-2xl border border-emerald-400/25 bg-black/45 px-6 py-4 text-white backdrop-blur-md">
          <div className="relative flex size-24 items-center justify-center">
            <span
              className={cn(
                "absolute rounded-full bg-emerald-400/25 transition-all duration-[3800ms] ease-in-out",
                breathPhase === 0
                  ? "size-24 opacity-90"
                  : breathPhase === 1
                    ? "size-24 opacity-100"
                    : "size-12 opacity-50",
              )}
            />
            <span className="relative size-10 rounded-full border border-emerald-300/60 bg-emerald-500/30" />
          </div>
          <p className="text-[12.5px] font-medium text-emerald-200">{phaseLabel}</p>
        </div>
      ) : null}

      {showMantra ? (
        <div
          className={cn(
            "flex max-w-lg items-center gap-2 rounded-full border px-3.5 py-1 text-[11px]",
            darkSurface
              ? "border-white/10 bg-white/5 text-white/70"
              : "border-line bg-surface-2/60 text-muted",
          )}
        >
          <Quote className="size-3 shrink-0 text-accent" />
          <span className="truncate italic">
            {(isVi ? MANTRAS_VI : MANTRAS_EN)[mantraIdx % MANTRAS_VI.length]}
          </span>
          <button
            type="button"
            onClick={() => setMantraIdx((i) => (i + 1) % MANTRAS_VI.length)}
            title={isVi ? "Đổi câu khác" : "Next mantra"}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <RefreshCw className="size-3" />
          </button>
          <button
            type="button"
            onClick={() => setShowMantra(false)}
            title={isVi ? "Ẩn" : "Hide"}
            className="shrink-0 opacity-70 hover:opacity-100"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
