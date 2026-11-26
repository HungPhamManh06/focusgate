"use client";

import { Check, Chrome, Copy, Laptop, Smartphone } from "lucide-react";
import { useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function QuickConnectCard() {
  const isVi = useLocale() === "vi";
  const [copied, setCopied] = useState(false);

  async function copyOrigin() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  }

  return (
    <Card className="mt-4 fg-bento-glow">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <CardTitle>
            {isVi ? "Kết nối nhanh Đa thiết bị (3 bước)" : "Multi-Device Quick Connect (3 Steps)"}
          </CardTitle>
          <p className="mt-0.5 text-[12px] text-muted">
            {isVi
              ? "Đồng bộ Cổng tập trung tức thì giữa điện thoại Android, máy tính Windows và trình duyệt Chrome/Edge."
              : "Sync your living gate across Android, Windows Desktop Agent, and Chrome/Edge Extension."}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void copyOrigin()}>
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? (isVi ? "Đã chép URL" : "Copied URL") : isVi ? "Chép URL Workspace" : "Copy Workspace URL"}
        </Button>
      </CardHeader>
      <CardContent className="grid gap-3 pt-3 sm:grid-cols-3">
        <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <Smartphone className="size-4 text-success" />
            1. Android Guard
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {isVi
              ? "Đăng nhập cùng email tài khoản trên app Android để tự động đồng bộ kế hoạch & chặn app giải trí."
              : "Sign in with the same email on the Android app to sync today's plan & block distracting apps."}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <Laptop className="size-4 text-sky-500" />
            2. Windows Agent
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {isVi
              ? "Chạy FocusGate Agent ở khay hệ thống Windows để khóa game/app và hiện đồng hồ nổi góc màn hình."
              : "Run the Windows tray agent to enforce app rules and show the floating focus timer pill."}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2/50 p-3.5">
          <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
            <Chrome className="size-4 text-accent" />
            3. Chrome / Edge Extension
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
            {isVi
              ? "Đăng nhập trên popup Extension để chặn trang web và bật YouTube Study Mode không gợi ý."
              : "Sign in inside the browser extension popup to block sites and enable YouTube Study Mode."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
