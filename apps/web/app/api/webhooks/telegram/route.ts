import { NextResponse } from "next/server";
import { createTask } from "@/lib/data/tasks";
import { addPlanTask, ensureTodayPlan, getTodayPlan } from "@/lib/data/planner";

export const dynamic = "force-dynamic";

/**
 * Telegram Bot Webhook for Quick Capture (`/add <title> [45m]`) and `/today`.
 * Authenticated via `X-Telegram-Bot-Api-Secret-Token` matching `TELEGRAM_WEBHOOK_SECRET`
 * (or open in local dev when Supabase is unconfigured).
 */
export async function POST(request: Request) {
  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (configuredSecret) {
    const headerSecret = request.headers.get("x-telegram-bot-api-secret-token");
    if (headerSecret !== configuredSecret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let update: {
    message?: {
      chat?: { id: number | string };
      text?: string;
    };
  };
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = (update.message?.text ?? "").trim();
  const chatId = update.message?.chat?.id;
  if (!text) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  let replyText = "FocusGate Bot: dùng `/add <tên việc> 30m` hoặc `/today`.";

  if (text.toLowerCase().startsWith("/add ")) {
    const raw = text.slice(5).trim();
    const minMatch = /(\d{1,3})\s*(m|min|p|phút)$/i.exec(raw);
    const minutes = minMatch ? Math.max(5, Math.min(180, Number(minMatch[1]))) : 30;
    const title = (minMatch ? raw.slice(0, minMatch.index) : raw).trim();
    if (title) {
      try {
        const created = await createTask({
          title,
          description: "Captured via Telegram Bot",
          category: "work",
          priority: "high",
          kind: "must_do",
          estimatedMinutes: minutes,
          requiredFocusMinutes: Math.min(minutes, 45),
          dueDate: null,
        });
        const planId = await ensureTodayPlan();
        await addPlanTask(planId, created.id, "must_do");
        replyText = `✅ Đã thêm vào kế hoạch hôm nay: "${title}" (${minutes}m)`;
      } catch (err) {
        replyText = `⚠️ Không thể thêm việc: ${err instanceof Error ? err.message : "unknown error"}`;
      }
    }
  } else if (text.toLowerCase().startsWith("/today")) {
    try {
      const plan = await getTodayPlan();
      if (!plan) {
        replyText = "📋 Hôm nay bạn chưa tạo kế hoạch. Gửi `/add <việc> 30m` để bắt đầu!";
      } else {
        const done = plan.tasks.filter((t) => Boolean(t.completedAt)).length;
        replyText = `🛡️ FocusGate Hôm nay (${plan.status}): ${done}/${plan.tasks.length} việc xong · ${plan.progress.focusDone}m tập trung.`;
      }
    } catch {
      replyText = "⚠️ Không đọc được kế hoạch hôm nay.";
    }
  }

  // Optional reply back to Telegram if BOT token is configured
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken && chatId !== undefined) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: replyText }),
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true, replyText });
}
