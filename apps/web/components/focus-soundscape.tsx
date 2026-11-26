"use client";

import { Headphones, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import {
  generatePinkSample,
  SOUNDSCAPE_PRESETS,
  type SoundPreset,
} from "@/lib/domain/soundscapes";
import { cn } from "@/lib/utils";

const VOLUME_STORAGE_KEY = "focusgate:soundscape-volume";
const LAST_PRESET_STORAGE_KEY = "focusgate:soundscape-last-preset";

function createPinkNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const state = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
  for (let i = 0; i < length; i += 1) {
    data[i] = generatePinkSample(Math.random() * 2 - 1, state);
  }
  return buffer;
}

function createBrownNoiseBuffer(ctx: AudioContext, seconds = 4): AudioBuffer {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = Math.max(-1, Math.min(1, lastOut * 3.1));
  }
  return buffer;
}

function createRainBuffer(ctx: AudioContext, seconds = 5): AudioBuffer {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = buffer.getChannelData(ch);
    const pink = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
    let dropEnv = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      const bed = generatePinkSample(white, pink);
      if (Math.random() < 0.0014) {
        dropEnv = 0.25 + Math.random() * 0.3;
      } else {
        dropEnv *= 0.992;
      }
      data[i] = Math.max(-1, Math.min(1, bed * 0.85 + white * dropEnv));
    }
  }
  return buffer;
}

function createCrackleBuffer(ctx: AudioContext, seconds = 6): AudioBuffer {
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let popDecay = 0;
  let popSign = 1;
  for (let i = 0; i < length; i += 1) {
    if (Math.random() < 0.00055) {
      popDecay = 0.45 + Math.random() * 0.55;
      popSign = Math.random() < 0.5 ? 1 : -1;
    } else {
      popDecay *= 0.978;
    }
    const fineSnap = Math.random() < 0.0015 ? (Math.random() * 2 - 1) * 0.14 : 0;
    data[i] = Math.max(-1, Math.min(1, popDecay * popSign * (Math.random() * 0.8 + 0.2) + fineSnap));
  }
  return buffer;
}

export function FocusSoundscape({
  onPresetChange,
  darkSurface = false,
}: {
  onPresetChange?: (preset: SoundPreset) => void;
  darkSurface?: boolean;
} = {}) {
  const isVi = useLocale() === "vi";
  const [preset, setPreset] = useState<SoundPreset>("off");
  const [lastPreset, setLastPreset] = useState<SoundPreset>("brown");
  const [volume, setVolume] = useState(0.28);
  const [layer2, setLayer2] = useState<"off" | "rain" | "fireplace" | "cafe">("off");
  const [layer2Volume, setLayer2Volume] = useState(0.22);
  const [favorites, setFavorites] = useState<string[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const layer2GainRef = useRef<GainNode | null>(null);
  const layer2CleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    try {
      const savedVol = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
      if (Number.isFinite(savedVol) && savedVol >= 0.05 && savedVol <= 0.8) {
        setVolume(savedVol);
      }
      const savedPreset = window.localStorage.getItem(LAST_PRESET_STORAGE_KEY) as SoundPreset | null;
      if (savedPreset && savedPreset !== "off" && SOUNDSCAPE_PRESETS.some((p) => p.id === savedPreset)) {
        setLastPreset(savedPreset);
      }
      const savedFavs = JSON.parse(window.localStorage.getItem("focusgate:sound-favs") || "[]") as string[];
      if (Array.isArray(savedFavs)) setFavorites(savedFavs);
    } catch {
      // Ignore storage errors in restricted environments.
    }
  }, []);

  const stopLayer2 = () => {
    const g = layer2GainRef.current;
    const ctx = ctxRef.current;
    if (g && ctx) {
      try {
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setValueAtTime(Math.max(0.001, g.gain.value), ctx.currentTime);
        g.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      } catch {
        // ignore
      }
    }
    layer2CleanupRef.current?.();
    layer2CleanupRef.current = null;
    if (layer2GainRef.current) {
      try {
        layer2GainRef.current.disconnect();
      } catch {
        // ignore
      }
      layer2GainRef.current = null;
    }
  };

  const stopAllAudio = () => {
    stopLayer2();
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
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
    } catch {
      // ignore
    }
  }, [volume]);

  useEffect(() => {
    onPresetChange?.(preset);
    stopAllAudio();
    if (preset === "off") return;

    try {
      window.localStorage.setItem(LAST_PRESET_STORAGE_KEY, preset);
      setLastPreset(preset);
    } catch {
      // ignore
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

    const cleanups: Array<() => void> = [];
    const trackNode = (node: AudioNode) => {
      cleanups.push(() => {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      });
    };
    const trackStoppable = (node: AudioScheduledSourceNode) => {
      cleanups.push(() => {
        try {
          node.stop();
        } catch {
          // ignore
        }
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      });
    };

    if (preset === "brown" || preset === "pink") {
      const src = ctx.createBufferSource();
      src.buffer = preset === "brown" ? createBrownNoiseBuffer(ctx) : createPinkNoiseBuffer(ctx);
      src.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = preset === "brown" ? 360 : 1850;

      src.connect(filter);
      filter.connect(master);
      src.start();
      trackStoppable(src);
      trackNode(filter);
    } else if (preset === "rain") {
      const rainSrc = ctx.createBufferSource();
      rainSrc.buffer = createRainBuffer(ctx);
      rainSrc.loop = true;

      const rainFilter = ctx.createBiquadFilter();
      rainFilter.type = "lowpass";
      rainFilter.frequency.value = 2100;

      const rainGain = ctx.createGain();
      rainGain.gain.value = 0.85;

      const rumbleSrc = ctx.createBufferSource();
      rumbleSrc.buffer = createBrownNoiseBuffer(ctx);
      rumbleSrc.loop = true;

      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = "lowpass";
      rumbleFilter.frequency.value = 210;

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.45;

      rainSrc.connect(rainFilter);
      rainFilter.connect(rainGain);
      rainGain.connect(master);

      rumbleSrc.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(master);

      rainSrc.start();
      rumbleSrc.start();
      trackStoppable(rainSrc);
      trackStoppable(rumbleSrc);
      trackNode(rainFilter);
      trackNode(rainGain);
      trackNode(rumbleFilter);
      trackNode(rumbleGain);
    } else if (preset === "ocean") {
      const surfSrc = ctx.createBufferSource();
      surfSrc.buffer = createPinkNoiseBuffer(ctx, 5);
      surfSrc.loop = true;

      const waveFilter = ctx.createBiquadFilter();
      waveFilter.type = "lowpass";
      waveFilter.frequency.value = 520;
      waveFilter.Q.value = 0.7;

      const waveGain = ctx.createGain();
      waveGain.gain.value = 0.65;

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.11; // ~9-second wave cycle

      const filterLfoGain = ctx.createGain();
      filterLfoGain.gain.value = 380;

      const ampLfoGain = ctx.createGain();
      ampLfoGain.gain.value = 0.35;

      lfo.connect(filterLfoGain);
      filterLfoGain.connect(waveFilter.frequency);
      lfo.connect(ampLfoGain);
      ampLfoGain.connect(waveGain.gain);

      surfSrc.connect(waveFilter);
      waveFilter.connect(waveGain);
      waveGain.connect(master);

      surfSrc.start();
      lfo.start();
      trackStoppable(surfSrc);
      trackStoppable(lfo);
      trackNode(waveFilter);
      trackNode(waveGain);
      trackNode(filterLfoGain);
      trackNode(ampLfoGain);
    } else if (preset === "forest") {
      const breezeSrc = ctx.createBufferSource();
      breezeSrc.buffer = createPinkNoiseBuffer(ctx, 5);
      breezeSrc.loop = true;

      const breezeFilter = ctx.createBiquadFilter();
      breezeFilter.type = "bandpass";
      breezeFilter.frequency.value = 540;
      breezeFilter.Q.value = 0.9;

      const breezeLfo = ctx.createOscillator();
      breezeLfo.type = "sine";
      breezeLfo.frequency.value = 0.17;
      const breezeMod = ctx.createGain();
      breezeMod.gain.value = 220;
      breezeLfo.connect(breezeMod);
      breezeMod.connect(breezeFilter.frequency);

      const streamSrc = ctx.createBufferSource();
      streamSrc.buffer = createRainBuffer(ctx, 5);
      streamSrc.loop = true;

      const streamFilter = ctx.createBiquadFilter();
      streamFilter.type = "bandpass";
      streamFilter.frequency.value = 1450;
      streamFilter.Q.value = 1.1;

      const streamGain = ctx.createGain();
      streamGain.gain.value = 0.42;

      breezeSrc.connect(breezeFilter);
      breezeFilter.connect(master);
      streamSrc.connect(streamFilter);
      streamFilter.connect(streamGain);
      streamGain.connect(master);

      breezeSrc.start();
      breezeLfo.start();
      streamSrc.start();
      trackStoppable(breezeSrc);
      trackStoppable(breezeLfo);
      trackStoppable(streamSrc);
      trackNode(breezeFilter);
      trackNode(breezeMod);
      trackNode(streamFilter);
      trackNode(streamGain);
    } else if (preset === "fireplace") {
      const hearthSrc = ctx.createBufferSource();
      hearthSrc.buffer = createBrownNoiseBuffer(ctx, 4);
      hearthSrc.loop = true;

      const hearthFilter = ctx.createBiquadFilter();
      hearthFilter.type = "lowpass";
      hearthFilter.frequency.value = 240;

      const hearthGain = ctx.createGain();
      hearthGain.gain.value = 0.9;

      const crackleSrc = ctx.createBufferSource();
      crackleSrc.buffer = createCrackleBuffer(ctx, 6);
      crackleSrc.loop = true;

      const crackleFilter = ctx.createBiquadFilter();
      crackleFilter.type = "bandpass";
      crackleFilter.frequency.value = 2600;
      crackleFilter.Q.value = 0.9;

      const crackleGain = ctx.createGain();
      crackleGain.gain.value = 0.7;

      hearthSrc.connect(hearthFilter);
      hearthFilter.connect(hearthGain);
      hearthGain.connect(master);

      crackleSrc.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(master);

      hearthSrc.start();
      crackleSrc.start();
      trackStoppable(hearthSrc);
      trackStoppable(crackleSrc);
      trackNode(hearthFilter);
      trackNode(hearthGain);
      trackNode(crackleFilter);
      trackNode(crackleGain);
    } else if (preset === "cafe") {
      const roomSrc = ctx.createBufferSource();
      roomSrc.buffer = createBrownNoiseBuffer(ctx, 5);
      roomSrc.loop = true;

      const lowBand = ctx.createBiquadFilter();
      lowBand.type = "bandpass";
      lowBand.frequency.value = 320;
      lowBand.Q.value = 0.7;

      const murmurSrc = ctx.createBufferSource();
      murmurSrc.buffer = createPinkNoiseBuffer(ctx, 5);
      murmurSrc.loop = true;

      const midBand = ctx.createBiquadFilter();
      midBand.type = "bandpass";
      midBand.frequency.value = 760;
      midBand.Q.value = 1.2;

      const midGain = ctx.createGain();
      midGain.gain.value = 0.45;

      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.25;
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.14;
      lfo.connect(lfoDepth);
      lfoDepth.connect(midGain.gain);

      roomSrc.connect(lowBand);
      lowBand.connect(master);
      murmurSrc.connect(midBand);
      midBand.connect(midGain);
      midGain.connect(master);

      roomSrc.start();
      murmurSrc.start();
      lfo.start();
      trackStoppable(roomSrc);
      trackStoppable(murmurSrc);
      trackStoppable(lfo);
      trackNode(lowBand);
      trackNode(midBand);
      trackNode(midGain);
      trackNode(lfoDepth);
    } else if (preset === "binaural") {
      const leftOsc = ctx.createOscillator();
      leftOsc.type = "sine";
      leftOsc.frequency.value = 200;

      const rightOsc = ctx.createOscillator();
      rightOsc.type = "sine";
      rightOsc.frequency.value = 210; // 10 Hz Alpha focus beat

      const leftPan = ctx.createStereoPanner();
      leftPan.pan.value = -0.85;
      const rightPan = ctx.createStereoPanner();
      rightPan.pan.value = 0.85;

      const toneGain = ctx.createGain();
      toneGain.gain.value = 0.18;

      const cushionSrc = ctx.createBufferSource();
      cushionSrc.buffer = createPinkNoiseBuffer(ctx, 4);
      cushionSrc.loop = true;
      const cushionFilter = ctx.createBiquadFilter();
      cushionFilter.type = "lowpass";
      cushionFilter.frequency.value = 650;
      const cushionGain = ctx.createGain();
      cushionGain.gain.value = 0.35;

      leftOsc.connect(leftPan);
      rightOsc.connect(rightPan);
      leftPan.connect(toneGain);
      rightPan.connect(toneGain);
      toneGain.connect(master);

      cushionSrc.connect(cushionFilter);
      cushionFilter.connect(cushionGain);
      cushionGain.connect(master);

      leftOsc.start();
      rightOsc.start();
      cushionSrc.start();
      trackStoppable(leftOsc);
      trackStoppable(rightOsc);
      trackStoppable(cushionSrc);
      trackNode(leftPan);
      trackNode(rightPan);
      trackNode(toneGain);
      trackNode(cushionFilter);
      trackNode(cushionGain);
    } else {
      // Warm breathing chord progression (Fmaj7 -> Am7 -> Dm9 -> Cmaj7)
      const firstChord: [number, number, number, number] = [174.61, 220.0, 261.63, 329.63];
      const chords: Array<[number, number, number, number]> = [
        firstChord, // Fmaj7
        [220.0, 261.63, 329.63, 392.0], // Am7
        [146.83, 220.0, 261.63, 329.63], // Dm9(no3)
        [130.81, 196.0, 246.94, 329.63], // Cmaj7
      ];
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = "lowpass";
      padFilter.frequency.value = 780;
      padFilter.connect(master);
      trackNode(padFilter);

      let step = 0;
      const voices = firstChord.map((freq, idx) => {
        const osc = ctx.createOscillator();
        osc.type = idx === 0 ? "triangle" : "sine";
        osc.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.value = idx === 0 ? 0.08 : 0.065;
        osc.connect(g);
        g.connect(padFilter);
        osc.start();
        trackStoppable(osc);
        trackNode(g);
        return osc;
      });

      const interval = window.setInterval(() => {
        step = (step + 1) % chords.length;
        const targetChord = chords[step] ?? firstChord;
        const now = ctx.currentTime;
        voices.forEach((osc, idx) => {
          const nextFreq = targetChord[idx] ?? targetChord[0];
          osc.frequency.setTargetAtTime(nextFreq, now, 1.2);
        });
      }, 6500);

      cleanups.push(() => window.clearInterval(interval));
    }

    cleanupRef.current = () => {
      for (const fn of cleanups) fn();
      try {
        master.disconnect();
      } catch {
        // ignore
      }
    };

    return () => {
      stopAllAudio();
    };
  }, [preset]);

  useEffect(() => {
    if (layer2GainRef.current) {
      layer2GainRef.current.gain.value = layer2Volume;
    }
  }, [layer2Volume]);

  useEffect(() => {
    stopLayer2();
    if (preset === "off" || layer2 === "off" || !ctxRef.current) return;
    const ctx = ctxRef.current;
    const g = ctx.createGain();
    g.gain.value = layer2Volume;
    g.connect(ctx.destination);
    layer2GainRef.current = g;

    const cleanups: Array<() => void> = [];
    const src = ctx.createBufferSource();
    src.loop = true;

    if (layer2 === "rain") {
      src.buffer = createRainBuffer(ctx, 4);
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 1900;
      src.connect(filter);
      filter.connect(g);
      cleanups.push(() => {
        try {
          filter.disconnect();
        } catch {
          // ignore
        }
      });
    } else if (layer2 === "fireplace") {
      src.buffer = createCrackleBuffer(ctx, 5);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 2400;
      filter.Q.value = 0.9;
      src.connect(filter);
      filter.connect(g);
      cleanups.push(() => {
        try {
          filter.disconnect();
        } catch {
          // ignore
        }
      });
    } else {
      src.buffer = createPinkNoiseBuffer(ctx, 4);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 680;
      filter.Q.value = 1.0;
      src.connect(filter);
      filter.connect(g);
      cleanups.push(() => {
        try {
          filter.disconnect();
        } catch {
          // ignore
        }
      });
    }

    src.start();
    cleanups.push(() => {
      try {
        src.stop();
        src.disconnect();
      } catch {
        // ignore
      }
    });

    layer2CleanupRef.current = () => {
      for (const fn of cleanups) fn();
    };

    return () => {
      stopLayer2();
    };
  }, [layer2, preset]);

  const activeDef = SOUNDSCAPE_PRESETS.find((item) => item.id === preset);

  return (
    <div
      className={cn(
        "mt-4 w-full max-w-xl rounded-xl border px-4 py-3",
        darkSurface
          ? "border-white/15 bg-black/35 text-[#f5eeee] backdrop-blur-md"
          : "border-line bg-surface-2/60",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
          <Headphones className="size-3.5 text-accent" />
          <span>{isVi ? "Âm thanh tập trung" : "Focus Soundscape"}</span>
          {preset === "off" && lastPreset !== "off" && (
            <button
              type="button"
              onClick={() => setPreset(lastPreset)}
              className="rounded-md border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-accent transition-colors hover:bg-surface-2"
            >
              {isVi
                ? `Phát lại: ${SOUNDSCAPE_PRESETS.find((p) => p.id === lastPreset)?.labelVi ?? ""}`
                : `Resume: ${SOUNDSCAPE_PRESETS.find((p) => p.id === lastPreset)?.label ?? ""}`}
            </button>
          )}
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
            max={0.8}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label={isVi ? "Âm lượng âm thanh tập trung" : "Soundscape volume"}
            className="h-1.5 w-24 accent-[var(--accent)]"
          />
          <span className="w-8 text-right text-[11px] tabular-nums text-muted">
            {Math.round(volume * 100)}%
          </span>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {[...SOUNDSCAPE_PRESETS]
          .sort((a, b) => {
            if (a.id === "off") return -1;
            if (b.id === "off") return 1;
            const fa = favorites.includes(a.id) ? 0 : 1;
            const fb = favorites.includes(b.id) ? 0 : 1;
            return fa - fb;
          })
          .map((item) => {
            const isFav = favorites.includes(item.id);
            return (
              <div key={item.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    if (item.id === "off") stopAllAudio();
                    setPreset(item.id);
                  }}
                  onContextMenu={(e) => {
                    if (item.id === "off") return;
                    e.preventDefault();
                    const next = isFav
                      ? favorites.filter((f) => f !== item.id)
                      : [...favorites, item.id];
                    setFavorites(next);
                    try {
                      window.localStorage.setItem("focusgate:sound-favs", JSON.stringify(next));
                    } catch {
                      // ignore
                    }
                  }}
                  title={
                    item.id === "off"
                      ? undefined
                      : isVi
                        ? "Chuột phải để ghim yêu thích ★"
                        : "Right-click to pin favorite ★"
                  }
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    preset === item.id
                      ? "border-accent bg-accent text-white"
                      : "border-line bg-surface text-muted hover:text-ink",
                  )}
                >
                  {isFav ? "★ " : ""}
                  {isVi ? item.labelVi : item.label}
                </button>
              </div>
            );
          })}
      </div>

      <p className="mt-2 text-[11px] text-muted">
        {activeDef ? (isVi ? activeDef.descriptionVi : activeDef.description) : ""}
      </p>

      {preset !== "off" ? (
        <div
          className={cn(
            "mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5",
            darkSurface ? "border-white/10" : "border-line",
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">
              {isVi ? "+ Lớp âm phụ:" : "+ Mix layer:"}
            </span>
            {(
              [
                { id: "off", label: isVi ? "Tắt" : "Off" },
                { id: "rain", label: isVi ? "Mưa" : "Rain" },
                { id: "fireplace", label: isVi ? "Lò sưởi" : "Fire" },
                { id: "cafe", label: isVi ? "Quán" : "Café" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLayer2(opt.id)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                  layer2 === opt.id
                    ? "border-accent bg-accent/20 text-accent"
                    : darkSurface
                      ? "border-white/15 bg-white/5 text-white/70 hover:text-white"
                      : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {layer2 !== "off" ? (
            <div className="flex items-center gap-1.5">
              <input
                type="range"
                min={0.05}
                max={0.65}
                step={0.05}
                value={layer2Volume}
                onChange={(e) => setLayer2Volume(Number(e.target.value))}
                aria-label={isVi ? "Âm lượng lớp phụ" : "Secondary layer volume"}
                className="h-1 w-20 accent-[var(--accent)]"
              />
              <span className="w-7 text-right text-[10.5px] tabular-nums text-muted">
                {Math.round(layer2Volume * 100)}%
              </span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
