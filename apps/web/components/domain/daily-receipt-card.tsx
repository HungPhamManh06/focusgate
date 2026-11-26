"use client";

import { Download, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";
import { cn } from "@/lib/utils";

type ReceiptRatio = "story" | "editorial" | "landscape";
type ReceiptTheme = "espresso" | "matcha" | "nordic";

const RATIO_CONFIG: Record<
  ReceiptRatio,
  { width: number; height: number; label: string; labelVi: string }
> = {
  story: { width: 1080, height: 1920, label: "9:16 Story", labelVi: "9:16 Story" },
  editorial: { width: 1080, height: 1350, label: "4:5 Card", labelVi: "4:5 Thẻ dọc" },
  landscape: { width: 1600, height: 900, label: "16:9 Wide", labelVi: "16:9 Ngang" },
};

const THEME_CONFIG: Record<
  ReceiptTheme,
  {
    name: string;
    bgStops: [string, string, string];
    paper: string;
    ink: string;
    muted: string;
    accent: string;
    divider: string;
    swatch: string;
  }
> = {
  espresso: {
    name: "Espresso",
    bgStops: ["#1c1214", "#120c0d", "#241113"],
    paper: "#faf7f5",
    ink: "#181213",
    muted: "#625355",
    accent: "#b91c1c",
    divider: "#dfd4d4",
    swatch: "from-[#1c1214] to-[#b91c1c]",
  },
  matcha: {
    name: "Kyoto Matcha",
    bgStops: ["#1c2a21", "#142019", "#283d30"],
    paper: "#f5f4ee",
    ink: "#1c241d",
    muted: "#58665a",
    accent: "#3f6a49",
    divider: "#d5ddd2",
    swatch: "from-[#1c2a21] to-[#3f6a49]",
  },
  nordic: {
    name: "Nordic Night",
    bgStops: ["#0f172a", "#0b1120", "#1e293b"],
    paper: "#f4f7fb",
    ink: "#0f172a",
    muted: "#475569",
    accent: "#3b82f6",
    divider: "#cbd5e1",
    swatch: "from-[#0f172a] to-[#3b82f6]",
  },
};

export function DailyReceiptCard({
  displayName,
  periodDays,
  focusMinutes,
  tasksCompleted,
  goldSeals,
  currentStreak,
  avgSleepMinutes,
  avgSteps,
  locale = "en",
}: {
  displayName: string;
  periodDays: number;
  focusMinutes: number;
  tasksCompleted: number;
  goldSeals: number;
  currentStreak: number;
  avgSleepMinutes: number;
  avgSteps: number;
  locale?: "en" | "vi";
}) {
  const isVi = locale === "vi";
  const [exporting, setExporting] = useState(false);
  const [ratio, setRatio] = useState<ReceiptRatio>("story");
  const [theme, setTheme] = useState<ReceiptTheme>("espresso");

  function downloadReceiptPng() {
    setExporting(true);
    try {
      const cfg = RATIO_CONFIG[ratio];
      const pal = THEME_CONFIG[theme];
      const canvas = document.createElement("canvas");
      canvas.width = cfg.width;
      canvas.height = cfg.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Artistic backdrop gradient
      const grad = ctx.createLinearGradient(0, 0, cfg.width, cfg.height);
      grad.addColorStop(0, pal.bgStops[0]);
      grad.addColorStop(0.55, pal.bgStops[1]);
      grad.addColorStop(1, pal.bgStops[2]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cfg.width, cfg.height);

      // Subtle decorative glow orb
      const orb = ctx.createRadialGradient(
        cfg.width * 0.8,
        cfg.height * 0.15,
        20,
        cfg.width * 0.8,
        cfg.height * 0.15,
        cfg.width * 0.45,
      );
      orb.addColorStop(0, `${pal.accent}44`);
      orb.addColorStop(1, "transparent");
      ctx.fillStyle = orb;
      ctx.fillRect(0, 0, cfg.width, cfg.height);

      const todayStr = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
        dateStyle: "long",
      }).format(new Date());

      const rows: Array<[string, string]> = [
        [isVi ? "TỔNG TẬP TRUNG HỢP LỆ" : "VERIFIED FOCUS", formatMinutes(focusMinutes)],
        [isVi ? "NHIỆM VỤ HOÀN THÀNH" : "TASKS COMPLETED", String(tasksCompleted)],
        [
          isVi ? "CHUỖI NGÀY KỶ LUẬT" : "DISCIPLINE STREAK",
          isVi ? `${currentStreak} ngày` : `${currentStreak} days`,
        ],
        [isVi ? "CON DẤU VÀNG" : "GOLD WAX SEALS", String(goldSeals)],
        [
          isVi ? "GIẤC NGỦ TRUNG BÌNH" : "AVG SLEEP",
          avgSleepMinutes > 0 ? `${(avgSleepMinutes / 60).toFixed(1)}h` : "—",
        ],
        [
          isVi ? "BƯỚC CHÂN TRUNG BÌNH" : "AVG STEPS",
          avgSteps > 0 ? avgSteps.toLocaleString() : "—",
        ],
      ];

      if (ratio === "landscape") {
        // 16:9 Editorial split layout
        ctx.fillStyle = pal.paper;
        ctx.beginPath();
        ctx.roundRect(80, 80, cfg.width - 160, cfg.height - 160, 36);
        ctx.fill();

        ctx.fillStyle = pal.accent;
        ctx.fillRect(140, 150, 88, 8);

        ctx.fillStyle = pal.muted;
        ctx.font = "600 22px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText("FOCUSGATE · DISCIPLINE RECEIPT", 140, 204);

        ctx.fillStyle = pal.ink;
        ctx.font = "700 62px Georgia, serif";
        ctx.fillText(displayName, 140, 290);

        ctx.fillStyle = pal.muted;
        ctx.font = "500 24px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText(
          isVi
            ? `Kỳ ${periodDays} ngày · ${todayStr}`
            : `${periodDays}-day ledger · ${todayStr}`,
          140,
          342,
        );

        ctx.fillStyle = pal.accent;
        ctx.font = "700 24px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText("FOCUS · EARN · UNLOCK", 140, 750);

        // Right column metrics
        let y = 210;
        for (const [label, value] of rows) {
          ctx.fillStyle = pal.muted;
          ctx.font = "600 20px system-ui, -apple-system, Segoe UI, sans-serif";
          ctx.fillText(label, 780, y);

          ctx.fillStyle = pal.ink;
          ctx.font = "700 40px Georgia, serif";
          ctx.textAlign = "right";
          ctx.fillText(value, 1450, y + 6);
          ctx.textAlign = "left";

          ctx.strokeStyle = pal.divider;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(780, y + 32);
          ctx.lineTo(1450, y + 32);
          ctx.stroke();
          y += 94;
        }
      } else {
        // Vertical layout (9:16 Story or 4:5 Editorial)
        const cardTop = ratio === "story" ? 260 : 110;
        const cardH = ratio === "story" ? 1400 : 1130;
        ctx.fillStyle = pal.paper;
        ctx.beginPath();
        ctx.roundRect(96, cardTop, 888, cardH, 40);
        ctx.fill();

        ctx.fillStyle = pal.accent;
        ctx.fillRect(156, cardTop + 70, 88, 8);

        ctx.fillStyle = pal.muted;
        ctx.font = "600 26px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText("FOCUSGATE · DISCIPLINE RECEIPT", 156, cardTop + 128);

        ctx.fillStyle = pal.ink;
        ctx.font = "700 62px Georgia, serif";
        ctx.fillText(displayName, 156, cardTop + 214);

        ctx.fillStyle = pal.muted;
        ctx.font = "500 28px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText(
          isVi
            ? `Kỳ ${periodDays} ngày · Xuất ngày ${todayStr}`
            : `${periodDays}-day ledger · ${todayStr}`,
          156,
          cardTop + 268,
        );

        ctx.strokeStyle = pal.divider;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 10]);
        ctx.beginPath();
        ctx.moveTo(156, cardTop + 322);
        ctx.lineTo(924, cardTop + 322);
        ctx.stroke();
        ctx.setLineDash([]);

        const rowStep = ratio === "story" ? 132 : 104;
        let y = cardTop + (ratio === "story" ? 420 : 405);
        for (const [label, value] of rows) {
          ctx.fillStyle = pal.muted;
          ctx.font = "600 24px system-ui, -apple-system, Segoe UI, sans-serif";
          ctx.fillText(label, 156, y);

          ctx.fillStyle = pal.ink;
          ctx.font = "700 46px Georgia, serif";
          ctx.textAlign = "right";
          ctx.fillText(value, 924, y + 6);
          ctx.textAlign = "left";

          ctx.strokeStyle = pal.divider;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(156, y + 38);
          ctx.lineTo(924, y + 38);
          ctx.stroke();
          y += rowStep;
        }

        ctx.fillStyle = pal.accent;
        ctx.font = "700 28px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText("FOCUS · EARN · UNLOCK", 156, cardTop + cardH - 68);
      }

      const link = document.createElement("a");
      link.download = `focusgate-receipt-${ratio}-${theme}-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="mt-4 overflow-hidden border-line bg-gradient-to-br from-surface via-surface to-surface-2">
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ReceiptText className="size-4 text-accent" />
            <CardTitle>
              {isVi ? "Biên lai kỷ luật 2.0 (Xuất ảnh)" : "Focus Receipt 2.0 (Shareable Card)"}
            </CardTitle>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Chọn tỷ lệ khung hình (Story 9:16, Thẻ dọc, Ngang 16:9) và nền nghệ thuật để tải ảnh PNG sắc nét."
              : "Pick an aspect ratio (9:16 Story, 4:5 Card, 16:9 Wide) and backdrop preset to export a crisp PNG."}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={exporting}
          onClick={downloadReceiptPng}
        >
          <Download className="size-3.5" />
          {exporting
            ? isVi
              ? "Đang xuất ảnh…"
              : "Exporting…"
            : isVi
              ? "Tải ảnh PNG"
              : "Download PNG"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-full border border-line bg-surface p-0.5 text-[11px]">
            {(Object.keys(RATIO_CONFIG) as ReceiptRatio[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRatio(r)}
                className={cn(
                  "rounded-full px-2.5 py-1 font-medium transition-colors",
                  ratio === r ? "bg-ink text-canvas" : "text-muted hover:text-ink",
                )}
              >
                {isVi ? RATIO_CONFIG[r].labelVi : RATIO_CONFIG[r].label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            {(Object.keys(THEME_CONFIG) as ReceiptTheme[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTheme(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  theme === t
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface text-muted hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2.5 rounded-full bg-gradient-to-br", THEME_CONFIG[t].swatch)}
                />
                {THEME_CONFIG[t].name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-dashed border-line bg-surface-2/60 p-4 sm:grid-cols-4">
          <div>
            <p className="text-[11px] text-muted">{isVi ? "Tập trung" : "Focus"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums">{formatMinutes(focusMinutes)}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{isVi ? "Hoàn thành" : "Completed"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums">{tasksCompleted}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{isVi ? "Chuỗi ngày" : "Streak"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums">
              {isVi ? `${currentStreak} ngày` : `${currentStreak}d`}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{isVi ? "Dấu Vàng" : "Gold seals"}</p>
            <p className="mt-0.5 font-display text-[22px] tabular-nums text-amber-600 dark:text-amber-400">
              {goldSeals}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
