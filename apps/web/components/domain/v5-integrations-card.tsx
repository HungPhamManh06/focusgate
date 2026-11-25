"use client";

import { BellRing, CalendarDays, Send } from "lucide-react";
import { useState, useTransition } from "react";
import { saveV5IntegrationsAction } from "@/lib/actions/v5";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function V5IntegrationsCard({
  initialCalendarIcsUrl,
  initialCalendarAutoLock,
  initialDiscordWebhookUrl,
  initialTelegramChatId,
}: {
  initialCalendarIcsUrl: string | null;
  initialCalendarAutoLock: boolean;
  initialDiscordWebhookUrl: string | null;
  initialTelegramChatId: string | null;
}) {
  const isVi = useLocale() === "vi";
  const [calendarIcsUrl, setCalendarIcsUrl] = useState(initialCalendarIcsUrl ?? "");
  const [calendarAutoLock, setCalendarAutoLock] = useState(initialCalendarAutoLock);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(initialDiscordWebhookUrl ?? "");
  const [telegramChatId, setTelegramChatId] = useState(initialTelegramChatId ?? "");
  const [pending, startTransition] = useTransition();
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveV5IntegrationsAction({
        calendarIcsUrl,
        calendarAutoLock,
        discordWebhookUrl,
        telegramChatId,
      });
      if (res.error) toast.push("error", res.error);
      else toast.push("success", isVi ? "Đã lưu cấu hình tích hợp!" : "Integrations saved!");
    });
  };

  const handleTestBriefing = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/cron/briefing", { method: "POST" });
      const data = (await res.json()) as { delivered?: string[]; error?: string };
      if (!res.ok) {
        toast.push("error", data.error ?? "Failed to send briefing");
      } else if (data.delivered && data.delivered.length > 0) {
        toast.push(
          "success",
          isVi
            ? `Đã gửi bản tin thử tới: ${data.delivered.join(", ")}`
            : `Test briefing sent to: ${data.delivered.join(", ")}`,
        );
      } else {
        toast.push(
          "info",
          isVi
            ? "Chưa có kênh nào được cấu hình (hãy dán Discord Webhook URL rồi bấm Lưu trước)."
            : "No delivery channel configured yet (save a Discord Webhook URL first).",
        );
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="size-4 text-accent" />
          {isVi
            ? "Đồng bộ Lịch (.ics) & Bot Thông báo (Discord / Telegram)"
            : "Calendar Sync (.ics) & Daily Briefing Bots"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2">
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-ink">
              {isVi
                ? "Google Calendar / Lịch học Secret iCal URL (.ics)"
                : "Google Calendar / Timetable Secret iCal URL (.ics)"}
            </label>
            <Input
              type="url"
              value={calendarIcsUrl}
              onChange={(e) => setCalendarIcsUrl(e.target.value)}
              placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
            />
            <label className="flex items-center gap-2 pt-1 text-[12px] text-muted">
              <input
                type="checkbox"
                checked={calendarAutoLock}
                onChange={(e) => setCalendarAutoLock(e.target.checked)}
              />
              {isVi
                ? "Tự động trừ quỹ giờ bận trên trục Time-Blocking & khóa cổng trong giờ học/họp"
                : "Subtract busy calendar events from timeline capacity & auto-lock during events"}
            </label>
          </div>

          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-[12px] font-medium text-ink">
                <BellRing className="size-3.5 text-accent" /> Discord Webhook URL
              </label>
              <Input
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-ink">
                Telegram Chat ID ({isVi ? "tùy chọn" : "optional"})
              </label>
              <Input
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="e.g. 123456789"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button type="submit" variant="accent" size="sm" disabled={pending}>
              {isVi ? "Lưu tích hợp" : "Save integrations"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={handleTestBriefing}
            >
              <Send className="size-3.5" />{" "}
              {isVi ? "Gửi thử Daily Briefing" : "Send Test Briefing"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
