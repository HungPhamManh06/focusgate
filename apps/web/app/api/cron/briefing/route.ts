import { NextResponse } from "next/server";
import { getTodayFocusSummary } from "@/lib/data/focus";
import { getTodayPlan } from "@/lib/data/planner";
import { getV2Settings } from "@/lib/data/v2-settings";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

/**
 * Sends a formatted Morning Briefing or Evening Focus Receipt to the user's
 * configured Discord Webhook URL and/or Telegram Bot Chat ID.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = Boolean(cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isCron && !(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [settings, plan, focus] = await Promise.all([
    getV2Settings(request),
    getTodayPlan(),
    getTodayFocusSummary(),
  ]);

  const isVi = settings.language === "vi";
  const total = plan?.tasks.length ?? 0;
  const done = plan?.tasks.filter((t) => Boolean(t.completedAt)).length ?? 0;
  const status = plan?.status ?? "draft";

  const message = isVi
    ? `🛡️ **FocusGate Daily Briefing**\n• Trạng thái Cổng: \`${status}\`\n• Tiến độ hôm nay: **${done}/${total}** nhiệm vụ\n• Tập trung hợp lệ: **${focus.minutes} phút** (${focus.validSessions} phiên)\n• Quỹ thưởng hiện có: **${settings.earnedMinutesBalance} phút**`
    : `🛡️ **FocusGate Daily Briefing**\n• Gate status: \`${status}\`\n• Today's progress: **${done}/${total}** tasks\n• Verified focus: **${focus.minutes} min** (${focus.validSessions} sessions)\n• Earned reward balance: **${settings.earnedMinutesBalance} min**`;

  const delivered: string[] = [];

  if (settings.discordWebhookUrl) {
    const res = await fetch(settings.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message }),
    }).catch(() => null);
    if (res?.ok) delivered.push("discord");
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && settings.telegramChatId) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: settings.telegramChatId,
        text: message.replace(/\*\*/g, ""),
      }),
    }).catch(() => null);
    if (res?.ok) delivered.push("telegram");
  }

  return NextResponse.json({ ok: true, delivered, preview: message });
}
