"use client";

import { Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { playFocusStartSfx } from "@/lib/domain/gate-sfx";

interface CustomPreset {
  id: string;
  name: string;
  minutes: number;
  sound: string;
}

const STORAGE_KEY = "focusgate:custom-presets";
const DEFAULT_PRESETS: CustomPreset[] = [
  { id: "p-deep", name: "Deep Write · 50m", minutes: 50, sound: "rain" },
  { id: "p-sprint", name: "Quick Review · 20m", minutes: 20, sound: "cafe" },
];

export function CustomFocusPresetsCard() {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [presets, setPresets] = useState<CustomPreset[]>(DEFAULT_PRESETS);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(45);
  const [sound, setSound] = useState("rain");

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null") as CustomPreset[] | null;
      if (Array.isArray(saved) && saved.length > 0) setPresets(saved.slice(0, 3));
    } catch {
      // ignore
    }
  }, []);

  function persist(next: CustomPreset[]) {
    setPresets(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  function addPreset(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    const next = [
      ...presets.slice(0, 2),
      { id: `p-${Date.now()}`, name: clean, minutes, sound },
    ];
    persist(next);
    setName("");
    setAdding(false);
    toast.push("success", isVi ? `Đã lưu preset "${clean}".` : `Saved preset "${clean}".`);
  }

  return (
    <Card className="fg-bento-glow">
      <CardHeader className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-accent" />
          <CardTitle>{isVi ? "Preset Tập trung Cá nhân" : "Custom Focus Presets"}</CardTitle>
        </div>
        {presets.length < 3 ? (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft hover:border-accent/40 hover:text-ink"
          >
            <Plus className="size-3" />
            {isVi ? "Tạo mới" : "New"}
          </button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2.5 pt-3">
        {adding ? (
          <form onSubmit={addPreset} className="space-y-2 rounded-xl border border-line bg-surface-2/60 p-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isVi ? "Tên preset (vd: Viết luận 50p)…" : "Preset name (e.g. Deep Code 50m)…"}
              className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] text-ink outline-none focus:border-accent"
            />
            <div className="flex items-center gap-2">
              <select
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                className="rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-ink"
              >
                {[15, 20, 25, 35, 45, 50, 60, 90].map((m) => (
                  <option key={m} value={m}>{m}m</option>
                ))}
              </select>
              <select
                value={sound}
                onChange={(e) => setSound(e.target.value)}
                className="flex-1 rounded-lg border border-line bg-surface px-2 py-1 text-[11.5px] text-ink"
              >
                <option value="rain">{isVi ? "Mưa đêm" : "Night Rain"}</option>
                <option value="cafe">{isVi ? "Quán cà phê" : "Warm Cafe"}</option>
                <option value="ocean">{isVi ? "Sóng biển" : "Ocean Waves"}</option>
                <option value="forest">{isVi ? "Rừng thông" : "Pine Forest"}</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-accent px-3 py-1 text-[11.5px] font-semibold text-white"
              >
                {isVi ? "Lưu" : "Save"}
              </button>
            </div>
          </form>
        ) : null}

        <div className="space-y-1.5">
          {presets.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/40 px-3 py-2 text-[12px]"
            >
              <button
                type="button"
                onClick={() => {
                  playFocusStartSfx();
                  try {
                    window.localStorage.setItem("focusgate-preferred-minutes", String(p.minutes));
                    window.localStorage.setItem("focusgate-preferred-sound", p.sound);
                  } catch {
                    // ignore
                  }
                  toast.push(
                    "success",
                    isVi
                      ? `Đã nạp preset "${p.name}" (${p.minutes}p · ${p.sound}).`
                      : `Loaded preset "${p.name}" (${p.minutes}m · ${p.sound}).`,
                  );
                }}
                className="flex min-w-0 flex-1 items-center justify-between text-left"
              >
                <span className="truncate font-medium text-ink hover:text-accent">{p.name}</span>
                <span className="shrink-0 font-mono text-[10.5px] text-muted tabular-nums">
                  {p.minutes}m · {p.sound}
                </span>
              </button>
              <button
                type="button"
                aria-label={isVi ? "Xóa preset" : "Delete preset"}
                onClick={() => persist(presets.filter((x) => x.id !== p.id))}
                className="rounded-md p-1 text-muted hover:bg-surface hover:text-accent"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
