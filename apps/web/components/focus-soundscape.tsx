"use client";

import { Headphones, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { cn } from "@/lib/utils";

type SoundPreset = "off" | "brown" | "rain" | "lofi";

const PRESETS: Array<{ id: SoundPreset; label: string; labelVi: string }> = [
  { id: "off", label: "Off", labelVi: "Tắt" },
  { id: "brown", label: "Brown Noise", labelVi: "Tiếng ồn nâu" },
  { id: "rain", label: "Rain", labelVi: "Tiếng mưa" },
  { id: "lofi", label: "Ambient Pad", labelVi: "Nhạc nền êm" },
];

export function FocusSoundscape() {
  const isVi = useLocale() === "vi";
  const [preset, setPreset] = useState<SoundPreset>("off");
  const [volume, setVolume] = useState(0.25);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopAllAudio = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (gainRef.current) {
      try {
        gainRef.current.gain.value = 0;
        gainRef.current.disconnect();
      } catch {
        // ignore
      }
      gainRef.current = null;
    }
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
    if (gainRef.current) {
      gainRef.current.gain.value = volume;
    }
  }, [volume]);

  useEffect(() => {
    stopAllAudio();

    if (preset === "off") return;

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    ctxRef.current = ctx;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    const master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    gainRef.current = master;

    if (preset === "brown" || preset === "rain") {
      const bufferSize = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i += 1) {
        const white = Math.random() * 2 - 1;
        if (preset === "brown") {
          lastOut = (lastOut + 0.02 * white) / 1.02;
          data[i] = lastOut * 3.2;
        } else {
          lastOut = (lastOut + 0.08 * white) / 1.08;
          data[i] = lastOut * 1.6 + white * 0.12;
        }
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = preset === "brown" ? 380 : 1200;

      source.connect(filter);
      filter.connect(master);
      source.start();

      cleanupRef.current = () => {
        try {
          source.stop();
          source.disconnect();
          filter.disconnect();
          master.disconnect();
        } catch {
          // ignore
        }
      };
    } else {
      const freqs = [174.61, 220.0, 261.63, 329.63];
      const oscs = freqs.map((f) => {
        const osc = ctx.createOscillator();
        const subGain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        subGain.gain.value = 0.08;
        osc.connect(subGain);
        subGain.connect(master);
        osc.start();
        return { osc, subGain };
      });

      cleanupRef.current = () => {
        for (const { osc, subGain } of oscs) {
          try {
            osc.stop();
            osc.disconnect();
            subGain.disconnect();
          } catch {
            // ignore
          }
        }
        try {
          master.disconnect();
        } catch {
          // ignore
        }
      };
    }

    return () => {
      stopAllAudio();
    };
  }, [preset]);

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
          <Headphones className="size-3.5 text-accent" />
          <span>{isVi ? "Âm thanh tập trung" : "Focus Soundscape"}</span>
        </div>
        <div className="flex items-center gap-2">
          {preset === "off" ? (
            <VolumeX className="size-3.5 text-muted" />
          ) : (
            <Volume2 className="size-3.5 text-accent" />
          )}
          <input
            type="range"
            min={0.05}
            max={0.6}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Soundscape volume"
            className="h-1.5 w-20 accent-[var(--accent)]"
          />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.id === "off") stopAllAudio();
              setPreset(item.id);
            }}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
              preset === item.id
                ? "border-accent bg-accent text-white"
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
