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

    const gain = ctx.createGain();
    gain.gain.value = 0.22;

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();

    return () => {
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
          <div className="flex items-end gap-0.5 pr-1" aria-hidden>
            <span className="h-3 w-0.5 animate-pulse rounded-full bg-accent" />
            <span className="h-4 w-0.5 animate-pulse rounded-full bg-accent [animation-delay:150ms]" />
            <span className="h-2.5 w-0.5 animate-pulse rounded-full bg-accent [animation-delay:300ms]" />
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
