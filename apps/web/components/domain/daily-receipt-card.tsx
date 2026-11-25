"use client";

import { Download, ReceiptText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMinutes } from "@/lib/data/format";

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

  function downloadReceiptPng() {
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Warm dark espresso editorial card background
      const grad = ctx.createLinearGradient(0, 0, 1080, 1350);
      grad.addColorStop(0, "#1c1214");
      grad.addColorStop(0.55, "#120c0d");
      grad.addColorStop(1, "#241113");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1350);

      // Inner receipt paper card
      ctx.fillStyle = "#faf7f5";
      ctx.beginPath();
      ctx.roundRect(96, 110, 888, 1130, 36);
      ctx.fill();

      // Header accent bar
      ctx.fillStyle = "#b91c1c";
      ctx.fillRect(156, 180, 88, 8);

      ctx.fillStyle = "#625355";
      ctx.font = "600 26px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("FOCUSGATE · DISCIPLINE RECEIPT", 156, 238);

      ctx.fillStyle = "#181213";
      ctx.font = "700 60px Georgia, serif";
      ctx.fillText(displayName, 156, 322);

      const todayStr = new Intl.DateTimeFormat(isVi ? "vi-VN" : "en-US", {
        dateStyle: "long",
      }).format(new Date());
      ctx.fillStyle = "#625355";
      ctx.font = "500 28px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(
        isVi ? `Kỳ ${periodDays} ngày · Xuất ngày ${todayStr}` : `${periodDays}-day ledger · ${todayStr}`,
        156,
        376,
      );

      // Dashed divider
      ctx.strokeStyle = "#dfd4d4";
      ctx.lineWidth = 3;
      ctx.setLineDash([12, 10]);
      ctx.beginPath();
      ctx.moveTo(156, 430);
      ctx.lineTo(924, 430);
      ctx.stroke();
      ctx.setLineDash([]);

      const rows: Array<[string, string]> = [
        [isVi ? "TỔNG TẬP TRUNG HỢP LỆ" : "VERIFIED FOCUS", formatMinutes(focusMinutes)],
        [isVi ? "NHIỆM VỤ HOÀN THÀNH" : "TASKS COMPLETED", String(tasksCompleted)],
        [isVi ? "CHUỖI NGÀY KỶ LUẬT" : "DISCIPLINE STREAK", isVi ? `${currentStreak} ngày` : `${currentStreak} days`],
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

      let y = 515;
      for (const [label, value] of rows) {
        ctx.fillStyle = "#625355";
        ctx.font = "600 24px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText(label, 156, y);

        ctx.fillStyle = "#181213";
        ctx.font = "700 44px Georgia, serif";
        ctx.textAlign = "right";
        ctx.fillText(value, 924, y + 6);
        ctx.textAlign = "left";

        ctx.strokeStyle = "#eee5e5";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(156, y + 36);
        ctx.lineTo(924, y + 36);
        ctx.stroke();
        y += 104;
      }

      // Footer stamp
      ctx.fillStyle = "#b91c1c";
      ctx.font = "700 28px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("FOCUS · EARN · UNLOCK", 156, 1170);

      const link = document.createElement("a");
      link.download = `focusgate-receipt-${new Date().toISOString().slice(0, 10)}.png`;
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
            <CardTitle>{isVi ? "Biên lai kỷ luật (Xuất ảnh)" : "Focus Receipt (Shareable Card)"}</CardTitle>
          </div>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Lưu thẻ tổng kết tiến độ dạng ảnh PNG sắc nét (1080×1350) làm nhật ký hoặc chia sẻ."
              : "Export a crisp editorial PNG summary card (1080×1350) for your journal or social story."}
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
            ? isVi ? "Đang xuất ảnh…" : "Exporting…"
            : isVi ? "Tải ảnh PNG" : "Download PNG"}
        </Button>
      </CardHeader>
      <CardContent className="pt-3">
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
