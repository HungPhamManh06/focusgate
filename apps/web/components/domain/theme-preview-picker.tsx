"use client";

import { Check, LayoutGrid, Palette, Sparkles, Sunrise, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type VisualPreset = "crimson" | "espresso" | "matcha" | "nordic";

const PRESETS: Array<{
  id: VisualPreset;
  isDark: boolean;
  nameEn: string;
  nameVi: string;
  descEn: string;
  descVi: string;
  bg: string;
  card: string;
  ink: string;
  accent: string;
  border: string;
}> = [
  {
    id: "crimson",
    isDark: false,
    nameEn: "Crimson Editorial",
    nameVi: "Giấy Ấm & Đỏ Thẫm",
    descEn: "Warm paper & classic seal crimson",
    descVi: "Nền giấy ấm cổ điển & ấn đỏ thẫm",
    bg: "#f7f3f3",
    card: "#ffffff",
    ink: "#181213",
    accent: "#b91c1c",
    border: "#e8dede",
  },
  {
    id: "espresso",
    isDark: true,
    nameEn: "Midnight Espresso",
    nameVi: "Espresso Đêm Đỏ",
    descEn: "Deep warm espresso & ruby glow",
    descVi: "Đêm sâu sang trọng & ánh đỏ ruby",
    bg: "#0e090a",
    card: "#171012",
    ink: "#f7f1f1",
    accent: "#f87171",
    border: "rgba(255,224,226,0.14)",
  },
  {
    id: "matcha",
    isDark: false,
    nameEn: "Kyoto Matcha",
    nameVi: "Trà Đạo Kyoto",
    descEn: "Washi ivory & serene jade green",
    descVi: "Giấy Washi & xanh lục trà đạo tĩnh tại",
    bg: "#f3f5f0",
    card: "#fcfdf9",
    ink: "#162119",
    accent: "#2d6a4f",
    border: "#d8e2d2",
  },
  {
    id: "nordic",
    isDark: false,
    nameEn: "Nordic Slate",
    nameVi: "Bắc Âu Tối Giản",
    descEn: "Crisp snow & Linear ice blue",
    descVi: "Xám tuyết sắc nét & xanh băng tối giản",
    bg: "#f3f6fa",
    card: "#ffffff",
    ink: "#0f172a",
    accent: "#2563eb",
    border: "#dce5f0",
  },
];

export function ThemePreviewPicker() {
  const isVi = useLocale() === "vi";
  const [preset, setPreset] = useState<VisualPreset>("crimson");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [fontStyle, setFontStyle] = useState<"serif" | "sans">("serif");
  const [accent, setAccent] = useState<string>("default");
  const [radius, setRadius] = useState<"soft" | "sharp">("soft");
  const [texture, setTexture] = useState<"plain" | "dots" | "paper">("plain");
  const [autoSunset, setAutoSunset] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem("focusgate-preset") as VisualPreset | null;
    if (saved && PRESETS.some((p) => p.id === saved)) {
      setPreset(saved);
    } else if (document.documentElement.classList.contains("dark")) {
      setPreset("espresso");
    }
    if (window.localStorage.getItem("focusgate-density") === "compact") {
      setDensity("compact");
    }
    if (window.localStorage.getItem("focusgate-font") === "sans") {
      setFontStyle("sans");
    }
    const savedAccent = window.localStorage.getItem("focusgate-accent");
    if (savedAccent) setAccent(savedAccent);
    if (window.localStorage.getItem("focusgate-radius") === "sharp") {
      setRadius("sharp");
    }
    const savedTex = window.localStorage.getItem("focusgate-texture");
    if (savedTex === "dots" || savedTex === "paper") setTexture(savedTex);
    if (window.localStorage.getItem("focusgate-auto-sunset") === "1") setAutoSunset(true);
    if (window.localStorage.getItem("focusgate-contrast") === "high") setHighContrast(true);
  }, []);

  const toggleHighContrast = () => {
    setHighContrast((prev) => {
      const next = !prev;
      if (next) document.documentElement.setAttribute("data-contrast", "high");
      else document.documentElement.removeAttribute("data-contrast");
      try {
        window.localStorage.setItem("focusgate-contrast", next ? "high" : "normal");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const applyTexture = (next: "plain" | "dots" | "paper") => {
    setTexture(next);
    if (next === "plain") document.documentElement.removeAttribute("data-texture");
    else document.documentElement.setAttribute("data-texture", next);
    try {
      window.localStorage.setItem("focusgate-texture", next);
    } catch {
      // ignore
    }
  };

  const toggleAutoSunset = () => {
    setAutoSunset((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("focusgate-auto-sunset", next ? "1" : "0");
      } catch {
        // ignore
      }
      if (next) {
        const hr = new Date().getHours();
        const isNight = hr >= 19 || hr < 6;
        document.documentElement.classList.toggle("dark", isNight);
        if (isNight) document.documentElement.removeAttribute("data-preset");
      }
      return next;
    });
  };

  const applyAccent = (next: string) => {
    setAccent(next);
    if (next === "default") document.documentElement.removeAttribute("data-accent");
    else document.documentElement.setAttribute("data-accent", next);
    try {
      window.localStorage.setItem("focusgate-accent", next);
    } catch {
      // ignore
    }
  };

  const applyRadius = (next: "soft" | "sharp") => {
    setRadius(next);
    if (next === "sharp") document.documentElement.setAttribute("data-radius", "sharp");
    else document.documentElement.removeAttribute("data-radius");
    try {
      window.localStorage.setItem("focusgate-radius", next);
    } catch {
      // ignore
    }
  };

  const applyDensity = (next: "comfortable" | "compact") => {
    setDensity(next);
    if (next === "compact") {
      document.documentElement.setAttribute("data-density", "compact");
    } else {
      document.documentElement.removeAttribute("data-density");
    }
    try {
      window.localStorage.setItem("focusgate-density", next);
    } catch {
      // ignore
    }
  };

  const applyFont = (next: "serif" | "sans") => {
    setFontStyle(next);
    if (next === "sans") {
      document.documentElement.setAttribute("data-font", "sans");
    } else {
      document.documentElement.removeAttribute("data-font");
    }
    try {
      window.localStorage.setItem("focusgate-font", next);
    } catch {
      // ignore
    }
  };

  const applyPreset = (target: (typeof PRESETS)[number]) => {
    setPreset(target.id);
    document.documentElement.classList.toggle("dark", target.isDark);
    if (target.id === "matcha" || target.id === "nordic") {
      document.documentElement.setAttribute("data-preset", target.id);
    } else {
      document.documentElement.removeAttribute("data-preset");
    }
    try {
      window.localStorage.setItem("focusgate-preset", target.id);
      window.localStorage.setItem("focusgate-theme", target.isDark ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="size-4 text-accent" />
          {isVi ? "FocusGate Themes Studio (4 bộ chủ đề)" : "FocusGate Themes Studio (4 Presets)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3.5 pt-3 sm:grid-cols-2 lg:grid-cols-4">
        {PRESETS.map((item) => {
          const active = preset === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => applyPreset(item)}
              className={cn(
                "group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all active:scale-[0.98]",
                active ? "border-accent ring-2 ring-accent/35" : "border-line hover:border-ink/30",
              )}
              style={{ background: item.bg, color: item.ink }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[12.5px] font-bold">
                  {isVi ? item.nameVi : item.nameEn}
                </span>
                {active && (
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
                    style={{ background: item.accent }}
                  >
                    <Check className="size-3" />
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[10.5px] opacity-75">
                {isVi ? item.descVi : item.descEn}
              </p>
              <div
                className="mt-3 flex gap-2 rounded-xl border p-2"
                style={{ background: item.card, borderColor: item.border }}
              >
                <div
                  className="h-9 w-8 rounded-lg"
                  style={{ background: item.accent, opacity: 0.9 }}
                />
                <div className="flex-1 space-y-1.5 pt-0.5">
                  <div className="h-2 w-3/4 rounded" style={{ background: item.ink, opacity: 0.8 }} />
                  <div className="h-1.5 w-1/2 rounded" style={{ background: item.ink, opacity: 0.35 }} />
                  <div className="h-1.5 w-2/5 rounded" style={{ background: item.accent, opacity: 0.75 }} />
                </div>
              </div>
            </button>
          );
        })}

        <div className="col-span-full mt-2 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <LayoutGrid className="size-3.5 text-accent" />
              <span>{isVi ? "Mật độ hiển thị" : "Display density"}</span>
            </div>
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-[11px]">
              {(
                [
                  { id: "comfortable", label: isVi ? "Thoáng" : "Comfortable" },
                  { id: "compact", label: isVi ? "Gọn" : "Compact" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyDensity(opt.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                    density === opt.id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <Type className="size-3.5 text-accent" />
              <span>{isVi ? "Phong cách tiêu đề" : "Heading typography"}</span>
            </div>
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-[11px]">
              {(
                [
                  { id: "serif", label: "Editorial Serif" },
                  { id: "sans", label: "Modern Sans" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyFont(opt.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                    fontStyle === opt.id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <Palette className="size-3.5 text-accent" />
              <span>{isVi ? "Màu nhấn (Accent)" : "Custom accent"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "default", color: "#78716c", label: isVi ? "Mặc định" : "Default" },
                  { id: "ruby", color: "#b91c1c", label: "Ruby" },
                  { id: "emerald", color: "#0d7a58", label: "Emerald" },
                  { id: "sapphire", color: "#2563eb", label: "Sapphire" },
                  { id: "amethyst", color: "#7c3aed", label: "Amethyst" },
                  { id: "amber", color: "#d97706", label: "Amber" },
                ] as const
              ).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => applyAccent(c.id)}
                  title={c.label}
                  aria-label={c.label}
                  className={cn(
                    "size-5 rounded-full border border-white/40 transition-transform hover:scale-115",
                    accent === c.id && "ring-2 ring-ink ring-offset-1 ring-offset-surface",
                  )}
                  style={{ backgroundColor: c.color }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <LayoutGrid className="size-3.5 text-accent" />
              <span>{isVi ? "Kiểu bo góc" : "Corner style"}</span>
            </div>
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-[11px]">
              {(
                [
                  { id: "soft", label: isVi ? "Mềm mại" : "Soft" },
                  { id: "sharp", label: isVi ? "Sắc nét" : "Sharp" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyRadius(opt.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                    radius === opt.id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <Sparkles className="size-3.5 text-accent" />
              <span>{isVi ? "Họa tiết nền" : "Canvas texture"}</span>
            </div>
            <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-[11px]">
              {(
                [
                  { id: "plain", label: isVi ? "Trơn" : "Plain" },
                  { id: "dots", label: "Dot-Grid" },
                  { id: "paper", label: isVi ? "Sổ kẻ" : "Lined" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => applyTexture(opt.id)}
                  className={cn(
                    "rounded-full px-2.5 py-0.5 font-medium transition-colors",
                    texture === opt.id ? "bg-ink text-canvas" : "text-muted hover:text-ink",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <Sunrise className="size-3.5 text-accent" />
              <span>{isVi ? "Tự đổi Đêm (19:00 → 06:00)" : "Auto Sunset Dark (19:00–06:00)"}</span>
            </div>
            <button
              type="button"
              onClick={toggleAutoSunset}
              className={cn(
                "rounded-full border px-3 py-0.5 text-[11px] font-semibold transition-colors",
                autoSunset
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {autoSunset ? (isVi ? "Đang bật" : "On") : isVi ? "Đang tắt" : "Off"}
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 sm:col-span-2">
            <div className="flex items-center gap-2 text-[12px] font-medium text-ink">
              <Type className="size-3.5 text-accent" />
              <span>{isVi ? "Chế độ Tương phản cao (Dễ đọc)" : "High-Contrast Reading Mode"}</span>
            </div>
            <button
              type="button"
              onClick={toggleHighContrast}
              className={cn(
                "rounded-full border px-3 py-0.5 text-[11px] font-semibold transition-colors",
                highContrast
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-muted hover:text-ink",
              )}
            >
              {highContrast ? (isVi ? "Đang bật" : "On") : isVi ? "Đang tắt" : "Off"}
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
