"use client";

import { Check, Palette } from "lucide-react";
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

  useEffect(() => {
    const saved = window.localStorage.getItem("focusgate-preset") as VisualPreset | null;
    if (saved && PRESETS.some((p) => p.id === saved)) {
      setPreset(saved);
    } else if (document.documentElement.classList.contains("dark")) {
      setPreset("espresso");
    }
  }, []);

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
      </CardContent>
    </Card>
  );
}
