"use client";

import { Check, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ThemePreviewPicker() {
  const isVi = useLocale() === "vi";
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const applyTheme = (nextDark: boolean) => {
    setDark(nextDark);
    document.documentElement.classList.toggle("dark", nextDark);
    try {
      window.localStorage.setItem("focusgate-theme", nextDark ? "dark" : "light");
    } catch {
      // ignore storage errors
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {dark ? <Moon className="size-4 text-accent" /> : <Sun className="size-4 text-accent" />}
          {isVi ? "Chủ đề giao diện (Xem trước trực tiếp)" : "Appearance Theme (Live Preview)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 pt-3 sm:grid-cols-2">
        {/* Warm Paper Light Preview */}
        <button
          type="button"
          onClick={() => applyTheme(false)}
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
            !dark ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink/30",
          )}
          style={{ background: "#f7f3f3", color: "#181213" }}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">
              <Sun className="size-3.5 text-[#b91c1c]" />
              {isVi ? "Giấy Ấm (Sáng)" : "Warm Paper (Light)"}
            </span>
            {!dark && (
              <span className="flex size-5 items-center justify-center rounded-full bg-[#b91c1c] text-white">
                <Check className="size-3" />
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2 rounded-xl border border-[#e8dede] bg-white p-2.5">
            <div className="h-10 w-10 rounded-lg bg-[#241315]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-2/3 rounded bg-[#181213]/80" />
              <div className="h-2 w-1/2 rounded bg-[#625355]/40" />
              <div className="h-2 w-1/3 rounded bg-[#b91c1c]/80" />
            </div>
          </div>
        </button>

        {/* Espresso Dark Preview */}
        <button
          type="button"
          onClick={() => applyTheme(true)}
          className={cn(
            "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.99]",
            dark ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-ink/30",
          )}
          style={{ background: "#0e090a", color: "#f7f1f1" }}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">
              <Moon className="size-3.5 text-[#f87171]" />
              {isVi ? "Espresso Đêm Đỏ (Tối)" : "Espresso Crimson (Dark)"}
            </span>
            {dark && (
              <span className="flex size-5 items-center justify-center rounded-full bg-[#f87171] text-[#181113]">
                <Check className="size-3" />
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2 rounded-xl border border-white/10 bg-[#171012] p-2.5">
            <div className="h-10 w-10 rounded-lg border border-[#f87171]/35 bg-[#281417]" />
            <div className="flex-1 space-y-1.5">
              <div className="h-2.5 w-2/3 rounded bg-[#f7f1f1]/85" />
              <div className="h-2 w-1/2 rounded bg-[#ab989b]/45" />
              <div className="h-2 w-1/3 rounded bg-[#34d399]/80" />
            </div>
          </div>
        </button>
      </CardContent>
    </Card>
  );
}
