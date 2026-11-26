"use client";

import { Headphones, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type MiniPreset = "brown" | "rain" | "fireplace";

const PRESETS: Array<{ id: MiniPreset; label: string; labelVi: string }> = [
  { id: "brown", label: "Brown", labelVi: "Nâu" },
  { id: "rain", label: "Rain", labelVi: "Mưa" },
  { id: "fireplace", label: "Fire", labelVi: "Lò sưởi" },
];

export function SidebarAmbientPlayer({ isVi }: { isVi: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [preset, setPreset] = useState<MiniPreset>("brown");
  const [bars, setBars] = useState<number[]>([4, 8, 12, 7, 5]);
  const ctxRef = useRef<AudioContext | null>(null);

  const stop = () => {
    if (ctxRef.current) {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      try {
        void ctx.suspend();
        void ctx.close();
      } catch {
        // ignore
      }
    }
  };

  useEffect(() => {
    stop();
    if (!playing) return;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();

    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      if (preset === "brown") {
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = Math.max(-1, Math.min(1, lastOut * 3.0));
      } else if (preset === "rain") {
        data[i] = white * 0.45;
      } else {
        lastOut = (lastOut + 0.03 * white) / 1.03;
        const pop = Math.random() < 0.0005 ? (Math.random() * 2 - 1) * 0.65 : 0;
        data[i] = Math.max(-1, Math.min(1, lastOut * 2.5 + pop));
      }
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = preset === "rain" ? "bandpass" : "lowpass";
    filter.frequency.value = preset === "rain" ? 1350 : preset === "fireplace" ? 420 : 340;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 32;
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const gain = ctx.createGain();
    gain.gain.value = 0.22;

    src.connect(filter);
    filter.connect(analyser);
    analyser.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let intervalId = 0;
    if (!prefersReduced) {
      intervalId = window.setInterval(() => {
        analyser.getByteFrequencyData(freqData);
        const next = [0, 1, 2, 3, 4].map((idx) => {
          const val = freqData[idx] ?? 0;
          return Math.max(4, Math.min(18, Math.round((val / 255) * 18) + 3));
        });
        setBars(next);
      }, 120);
    }

    return () => {
      if (intervalId) window.clearInterval(intervalId);
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
      stop();
    };
  }, [playing, preset]);

  return (
    <div className="rounded-2xl border border-line bg-surface-2/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <span
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-lg border transition-colors",
              playing
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {playing ? <Volume2 className="size-3.5" /> : <Headphones className="size-3.5" />}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[11.5px] font-medium text-ink">
              {playing
                ? isVi
                  ? "Đang phát nền"
                  : "Ambient playing"
                : isVi
                  ? "Âm thanh nền"
                  : "Quick ambient"}
            </p>
            <p className="text-[10px] text-muted">
              {PRESETS.find((p) => p.id === preset)?.[isVi ? "labelVi" : "label"]}
            </p>
          </div>
        </button>

        {playing ? (
          <div className="flex h-5 items-end gap-0.5 pr-1" aria-hidden>
            {bars.map((h, idx) => (
              <span
                key={idx}
                className="w-0.5 rounded-full bg-accent transition-all duration-100"
                style={{ height: `${h}px` }}
              />
            ))}
          </div>
        ) : (
          <VolumeX className="size-3.5 text-muted/60" />
        )}
      </div>

      <div className="mt-2.5 flex gap-1">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setPreset(item.id);
              setPlaying(true);
            }}
            className={cn(
              "flex-1 rounded-lg border px-1.5 py-1 text-[10.5px] font-medium transition-colors",
              preset === item.id && playing
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {isVi ? item.labelVi : item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
