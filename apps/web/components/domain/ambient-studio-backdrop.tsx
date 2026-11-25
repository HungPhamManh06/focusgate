import type { SoundPreset } from "@/lib/domain/soundscapes";

export function AmbientStudioBackdrop({ preset }: { preset: SoundPreset }) {
  if (preset === "rain") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0b1320] via-[#101826] to-[#141114]" />
        <div
          className="fg-animate-rain absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "repeating-linear-gradient(108deg, transparent 0px, transparent 34px, rgba(148,197,255,0.22) 34px, rgba(148,197,255,0.22) 35px), repeating-linear-gradient(108deg, transparent 0px, transparent 58px, rgba(203,227,255,0.14) 58px, rgba(203,227,255,0.14) 59px)",
            backgroundSize: "120px 260px, 160px 260px",
          }}
        />
      </div>
    );
  }

  if (preset === "ocean") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#091821] via-[#0e222c] to-[#11151a]" />
        <div className="fg-animate-ocean absolute -bottom-24 inset-x-[-10%] h-80 rounded-[100%] bg-gradient-to-t from-sky-500/25 via-cyan-400/15 to-transparent blur-2xl" />
      </div>
    );
  }

  if (preset === "fireplace") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#170e0d] via-[#1f1210] to-[#2c140e]" />
        <div className="fg-animate-hearth absolute -bottom-20 left-1/2 h-80 w-[620px] -translate-x-1/2 rounded-full bg-gradient-to-t from-orange-500/35 via-amber-500/18 to-transparent blur-3xl" />
      </div>
    );
  }

  if (preset === "forest") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1712] via-[#111e18] to-[#131714]" />
        <div className="fg-animate-gate absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/18 blur-3xl" />
      </div>
    );
  }

  if (preset === "binaural" || preset === "lofi") {
    return (
      <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-[#151018] via-[#181116] to-[#130e10]" />
        <div className="fg-animate-gate absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-rose-500/20 via-amber-400/12 to-indigo-400/18 blur-3xl" />
      </div>
    );
  }

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-[#161011] via-[#120d0e] to-[#1b1112]" />
      <div className="absolute left-1/2 top-1/3 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/12 blur-3xl" />
    </div>
  );
}
