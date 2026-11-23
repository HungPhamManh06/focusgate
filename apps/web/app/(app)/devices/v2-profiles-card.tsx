"use client";

import { CalendarDays, Globe, Laptop, Plus, Shield } from "lucide-react";
import { useState, useTransition } from "react";
import { createBlockRuleAction } from "@/lib/actions/devices";
import { updateV2SettingsAction } from "@/lib/actions/v2";
import type { DiscoveredAppRecord, V2Settings } from "@/lib/data/v2-settings";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function V2ProfilesCard({
  settings,
  discoveredApps,
}: {
  settings: V2Settings;
  discoveredApps: DiscoveredAppRecord[];
}) {
  const isVi = useLocale() === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const [whitelistMode, setWhitelistMode] = useState(settings.whitelistFocusMode);
  const [weekendRelaxed, setWeekendRelaxed] = useState(settings.weekendRelaxedMode);
  const [weekdayStart, setWeekdayStart] = useState(settings.weekdayBedtimeStart ?? "23:00");
  const [weekdayEnd, setWeekdayEnd] = useState(settings.weekdayBedtimeEnd ?? "06:00");
  const [weekendStart, setWeekendStart] = useState(settings.weekendBedtimeStart ?? "00:00");
  const [weekendEnd, setWeekendEnd] = useState(settings.weekendBedtimeEnd ?? "07:00");
  const [blockedDomainsText, setBlockedDomainsText] = useState(settings.blockedDomains.join(", "));
  const [allowedAppsText, setAllowedAppsText] = useState(settings.allowedApps.join(", "));

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const blockedDomains = blockedDomainsText
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const allowedApps = allowedAppsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    startTransition(async () => {
      const res = await updateV2SettingsAction({
        whitelistFocusMode: whitelistMode,
        weekendRelaxedMode: weekendRelaxed,
        weekdayBedtimeStart: weekdayStart || null,
        weekdayBedtimeEnd: weekdayEnd || null,
        weekendBedtimeStart: weekendStart || null,
        weekendBedtimeEnd: weekendEnd || null,
        blockedDomains,
        allowedApps,
      });
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  const handleBlockDiscovered = (app: DiscoveredAppRecord) => {
    startTransition(async () => {
      const res = await createBlockRuleAction({
        deviceId: app.deviceId,
        ruleType: "block",
        identifier: app.identifier,
        displayName: app.displayName,
        category: "entertainment",
        action: "terminate",
      });
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", `Blocked ${app.displayName}`);
    });
  };

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-accent" />
            {isVi ? "Lịch Ngày thường / Cuối tuần & Danh sách cho phép" : "Weekday / Weekend Profiles & Focus Whitelist"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12px]">
                <span className="text-muted">{isVi ? "Giờ ngủ ngày thường (bắt đầu)" : "Weekday Bedtime Start"}</span>
                <Input
                  type="time"
                  value={weekdayStart}
                  onChange={(e) => setWeekdayStart(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-[12px]">
                <span className="text-muted">{isVi ? "Giờ dậy ngày thường (kết thúc)" : "Weekday Bedtime End"}</span>
                <Input
                  type="time"
                  value={weekdayEnd}
                  onChange={(e) => setWeekdayEnd(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-[12px]">
                <span className="text-muted">{isVi ? "Giờ ngủ cuối tuần (bắt đầu)" : "Weekend Bedtime Start"}</span>
                <Input
                  type="time"
                  value={weekendStart}
                  onChange={(e) => setWeekendStart(e.target.value)}
                  className="mt-1"
                />
              </label>
              <label className="block text-[12px]">
                <span className="text-muted">{isVi ? "Giờ dậy cuối tuần (kết thúc)" : "Weekend Bedtime End"}</span>
                <Input
                  type="time"
                  value={weekendEnd}
                  onChange={(e) => setWeekendEnd(e.target.value)}
                  className="mt-1"
                />
              </label>
            </div>

            <label className="flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12px]">
              <span className="flex items-center gap-2 font-medium">
                <Shield className="size-3.5 text-accent" />
                {isVi
                  ? "Chế độ Chỉ cho phép Whitelist khi chạy đồng hồ Tập trung"
                  : "Whitelist-Only Mode while Focus Timer runs"}
              </span>
              <input
                type="checkbox"
                checked={whitelistMode}
                onChange={(e) => setWhitelistMode(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-line bg-surface-2/60 px-3 py-2 text-[12px]">
              <span className="font-medium">
                {isVi ? "Nới lỏng khóa vào cuối tuần (Thứ 7 – Chủ nhật)" : "Relaxed Lock on Weekends (Sat–Sun)"}
              </span>
              <input
                type="checkbox"
                checked={weekendRelaxed}
                onChange={(e) => setWeekendRelaxed(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
            </label>

            <label className="block text-[12px]">
              <span className="flex items-center gap-1.5 text-muted">
                <Globe className="size-3.5" />{" "}
                {isVi ? "Tên miền bị chặn (Tiện ích trình duyệt)" : "Blocked Domains (Browser Extension)"}
              </span>
              <Input
                value={blockedDomainsText}
                onChange={(e) => setBlockedDomainsText(e.target.value)}
                placeholder="youtube.com, facebook.com, tiktok.com"
                className="mt-1"
              />
            </label>

            <label className="block text-[12px]">
              <span className="text-muted">
                {isVi
                  ? "Ứng dụng công việc được phép (chế độ Whitelist, cách nhau dấu phẩy)"
                  : "Allowed Work Apps (Whitelist mode, comma-separated)"}
              </span>
              <Input
                value={allowedAppsText}
                onChange={(e) => setAllowedAppsText(e.target.value)}
                placeholder="Code.exe, notion.exe, chrome.exe"
                className="mt-1"
              />
            </label>

            <Button type="submit" variant="accent" size="sm" disabled={pending}>
              {isVi ? "Lưu hồ sơ & Quy tắc" : "Save Profiles & Rules"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Laptop className="size-4 text-accent" />
            {isVi ? "Ứng dụng đã phát hiện (Windows & Android)" : "Discovered Apps (Windows & Android)"}
          </CardTitle>
          <Badge tone="neutral">{discoveredApps.length}</Badge>
        </CardHeader>
        <CardContent className="pt-2">
          {discoveredApps.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi
                ? "Chưa phát hiện ứng dụng nào. Hãy chạy Windows Agent hoặc app Android để đồng bộ danh sách ứng dụng về đây."
                : "No discovered apps yet. Run the Windows Agent or Android app to report installed/running apps here for 1-click blocking."}
            </p>
          ) : (
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1">
              {discoveredApps.map((app) => (
                <div
                  key={app.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{app.displayName}</p>
                    <p className="truncate text-[11px] text-muted">
                      {app.identifier} · {app.platform}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => handleBlockDiscovered(app)}
                  >
                    <Plus className="size-3.5" /> {isVi ? "Chặn" : "Block"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
