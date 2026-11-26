"use client";

import type { SoundPreset } from "@/lib/domain/soundscapes";
import { AmbientParticleCanvas } from "@/components/domain/ambient-particle-canvas";

export function AmbientStudioBackdrop({ preset }: { preset: SoundPreset }) {
  const renderScene = () => {
    if (preset === "rain") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b1320] via-[#101826] to-[#141114]" />
          <div
            className="fg-animate-rain absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "repeating-linear-gradient(108deg, transparent 0px, transparent 34px, rgba(148,197,255,0.22) 34px, rgba(148,197,255,0.22) 35px), repeating-linear-gradient(108deg, transparent 0px, transparent 58px, rgba(203,227,255,0.14) 58px, rgba(203,227,255,0.14) 59px)",
              backgroundSize: "120px 260px, 160px 260px",
            }}
          />
        </>
      );
    }

    if (preset === "ocean") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#091821] via-[#0e222c] to-[#11151a]" />
          <div className="fg-animate-ocean absolute -bottom-24 inset-x-[-10%] h-80 rounded-[100%] bg-gradient-to-t from-sky-500/25 via-cyan-400/15 to-transparent blur-2xl" />
        </>
      );
    }

    if (preset === "fireplace") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#170e0d] via-[#1f1210] to-[#2c140e]" />
          <div className="fg-animate-hearth absolute -bottom-20 left-1/2 h-80 w-[620px] -translate-x-1/2 rounded-full bg-gradient-to-t from-orange-500/35 via-amber-500/18 to-transparent blur-3xl" />
        </>
      );
    }

    if (preset === "forest") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#0d1712] via-[#111e18] to-[#131714]" />
          <div className="fg-animate-gate absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/18 blur-3xl" />
        </>
      );
    }

    if (preset === "brown") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1a120f] via-[#150f0d] to-[#221612]" />
          <div className="fg-animate-hearth absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-900/30 blur-3xl" />
        </>
      );
    }

    if (preset === "pink") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1b1116] via-[#160f14] to-[#21131b]" />
          <div className="fg-animate-gate absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500/18 blur-3xl" />
        </>
      );
    }

    if (preset === "cafe") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#1b1410] via-[#17110e] to-[#231912]" />
          <div className="fg-animate-hearth absolute -top-24 right-1/4 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="fg-animate-gate absolute -bottom-24 left-1/4 h-80 w-80 rounded-full bg-orange-900/25 blur-3xl" />
        </>
      );
    }

    if (preset === "binaural") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#11101d] via-[#141122] to-[#0f0e17]" />
          <div className="fg-animate-gate absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-indigo-500/24 via-violet-500/16 to-cyan-400/14 blur-3xl" />
        </>
      );
    }

    if (preset === "lofi") {
      return (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-[#181016] via-[#171115] to-[#1e1312]" />
          <div className="fg-animate-gate absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-rose-500/22 via-amber-400/14 to-purple-500/16 blur-3xl" />
        </>
      );
    }

    return (
      <>
        <div className="absolute inset-0 bg-gradient-to-b from-[#161011] via-[#120d0e] to-[#1b1112]" />
        <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/12 blur-3xl" />
      </>
    );
  };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {renderScene()}
      <AmbientParticleCanvas preset={preset} />
    </div>
  );
}
