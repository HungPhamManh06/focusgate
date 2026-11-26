"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "crimson", isDark: false, dot: "#b91c1c", label: "Crimson" },
  { id: "espresso", isDark: true, dot: "#28181a", label: "Espresso" },
  { id: "matcha", isDark: false, dot: "#2d6a4f", label: "Kyoto Matcha" },
  { id: "nordic", isDark: false, dot: "#2563eb", label: "Nordic Slate" },
] as const;

export function LoginAmbientBar() {
  const [clock, setClock] = useState("");
  const [active, setActive] = useState("crimson");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
      );
    };
    update();
    const id = window.setInterval(update, 15_000);
    try {
      const saved = window.localStorage.getItem("focusgate-preset");
      if (saved) setActive(saved);
      else if (document.documentElement.classList.contains("dark")) setActive("espresso");
    } catch {
      // ignore
    }
    return () => window.clearInterval(id);
  }, []);

  function pick(p: (typeof PRESETS)[number]) {
    setActive(p.id);
    document.documentElement.classList.toggle("dark", p.isDark);
    if (p.id === "matcha" || p.id === "nordic") {
      document.documentElement.setAttribute("data-preset", p.id);
    } else {
      document.documentElement.removeAttribute("data-preset");
    }
    try {
      window.localStorage.setItem("focusgate-theme", p.isDark ? "dark" : "light");
      window.localStorage.setItem("focusgate-preset", p.id);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center justify-between rounded-full border border-line bg-surface px-3.5 py-1.5 text-[11.5px]">
      <span className="font-mono font-semibold text-ink-soft tabular-nums">
        {clock || "—:—"}
      </span>
      <div className="flex items-center gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            title={p.label}
            aria-label={p.label}
            onClick={() => pick(p)}
            className={cn(
              "size-4 rounded-full border border-white/40 transition-transform hover:scale-125",
              active === p.id && "ring-2 ring-accent ring-offset-1 ring-offset-surface",
            )}
            style={{ backgroundColor: p.dot }}
          />
        ))}
      </div>
    </div>
  );
}
