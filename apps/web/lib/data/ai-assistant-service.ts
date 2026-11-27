import "server-only";

import {
  completeAgentPlanTask,
  getAgentTodayPlan,
  type AgentPlanSnapshot,
} from "@/lib/data/agent-plan";
import { createAgentTask } from "@/lib/data/agent-tasks";
import {
  completeFocusSession,
  getActiveSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
} from "@/lib/data/focus";
import { activateUnlockPass } from "@/lib/data/v2-settings";
import {
  normalizeVietnameseMatch,
  parseAiIntent,
  type AiChatResponse,
} from "@/lib/domain/ai-assistant";

function isEnglishPrompt(text: string): boolean {
  const hasViDiacritics = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
    text,
  );
  if (hasViDiacritics) return false;
  return /\b(add|create|start|focus|pause|resume|complete|finish|today|status|next|unlock|task|summary|help|what|how)\b/i.test(
    text,
  );
}

function findMatchingPlanTask(snapshot: AgentPlanSnapshot, query: string) {
  const tasks = snapshot.plan?.tasks ?? [];
  const normQuery = normalizeVietnameseMatch(query);
  if (!normQuery) return null;

  const pending = tasks.filter((t) => t.status !== "completed");
  const exact = pending.find((t) => normalizeVietnameseMatch(t.title) === normQuery);
  if (exact) return exact;

  const contains = pending.find(
    (t) =>
      normalizeVietnameseMatch(t.title).includes(normQuery) ||
      normQuery.includes(normalizeVietnameseMatch(t.title)),
  );
  if (contains) return contains;

  const words = normQuery.split(" ").filter((w) => w.length >= 2);
  let best: { task: (typeof pending)[number]; score: number } | null = null;
  for (const task of pending) {
    const normTitle = normalizeVietnameseMatch(task.title);
    const score = words.reduce((acc, word) => acc + (normTitle.includes(word) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { task, score };
    }
  }
  return best?.task ?? null;
}

function buildContextSummary(snapshot: AgentPlanSnapshot, activeSessionLabel: string | null): string {
  const tasks = snapshot.plan?.tasks ?? [];
  const mustRemaining = tasks.filter((t) => t.kind === "must_do" && t.status !== "completed");
  const doneCount = tasks.filter((t) => t.status === "completed").length;
  const pendingTitles = tasks
    .filter((t) => t.status !== "completed")
    .slice(0, 5)
    .map((t) => `- [${t.kind}] ${t.title} (${t.focusDone}/${t.requiredFocusMinutes}m)`)
    .join("\n");

  return [
    `Date: ${snapshot.plan?.planDate ?? "no plan yet"}`,
    `Gate unlocked: ${snapshot.unlocked ? "yes" : "no"}`,
    `Progress: ${doneCount}/${tasks.length} tasks done, ${mustRemaining.length} Must-do remaining`,
    `Reward wallet: ${snapshot.activeGrantMinutes}m available`,
    `Active focus session: ${activeSessionLabel ?? "none"}`,
    pendingTitles ? `Pending tasks:\n${pendingTitles}` : "Pending tasks: none",
  ].join("\n");
}

async function callOptionalLlm(
  prompt: string,
  contextSummary: string,
  en: boolean,
): Promise<{ reply: string; provider: "gemini" | "openai" } | null> {
  const systemPrompt = en
    ? `You are FocusGate AI — a concise, calm, action-oriented discipline coach embedded across Web, Windows PC, and Android. Answer in 2-4 short sentences based on the user's live FocusGate state:\n${contextSummary}`
    : `Bạn là FocusGate AI — trợ lý kỷ luật & tập trung điềm tĩnh, ngắn gọn, đồng bộ trên Web, Windows PC và Android. Trả lời bằng tiếng Việt trong 2-4 câu ngắn, dựa trên trạng thái thực tế hôm nay:\n${contextSummary}`;

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (geminiKey) {
    try {
      const model = process.env.GEMINI_MODEL?.trim() || "gemini-2.0-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 280, temperature: 0.4 },
          }),
          signal: AbortSignal.timeout(12_000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text) return { reply: text, provider: "gemini" };
      }
    } catch {
      // Fall through to OpenAI or local engine
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  if (openaiKey) {
    try {
      const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt },
          ],
          max_tokens: 280,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content?.trim();
        if (text) return { reply: text, provider: "openai" };
      }
    } catch {
      // Fall through to local engine
    }
  }

  return null;
}

export async function runFocusGateAi(
  message: string,
  request?: Request,
): Promise<AiChatResponse> {
  const en = isEnglishPrompt(message);
  const intent = parseAiIntent(message);

  if (intent.type === "create_task") {
    await createAgentTask(
      {
        title: intent.title,
        kind: intent.kind,
        estimatedMinutes: intent.estimatedMinutes,
        requiredFocusMinutes: 0,
        addToTodayPlan: true,
      },
      request,
    );
    const kindLabel =
      intent.kind === "must_do"
        ? en
          ? "Must-do"
          : "Bắt buộc"
        : intent.kind === "should_do"
          ? en
            ? "Should-do"
            : "Nên làm"
          : en
            ? "Bonus"
            : "Thưởng";
    return {
      reply: en
        ? `Added "${intent.title}" (${kindLabel}, ~${intent.estimatedMinutes}m) to today's plan across Web, PC, and Android.`
        : `Đã thêm nhiệm vụ "${intent.title}" (${kindLabel}, ước tính ${intent.estimatedMinutes}p) vào kế hoạch hôm nay và đồng bộ sang Web, PC & Android.`,
      action: {
        type: "create_task",
        executed: true,
        label: en ? `Added: ${intent.title}` : `Đã thêm: ${intent.title}`,
      },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "start_focus") {
    const existing = await getActiveSession(request);
    if (existing) {
      return {
        reply: en
          ? `A focus session (${existing.taskTitle ?? `${existing.plannedMinutes}m`}) is already ${existing.status}. Say "pause focus" or "complete focus" first.`
          : `Bạn đang có phiên tập trung (${existing.taskTitle ?? `${existing.plannedMinutes}p`}) ở trạng thái ${existing.status === "paused" ? "tạm dừng" : "đang chạy"}. Bạn có thể nói "tiếp tục" hoặc "hoàn thành phiên tập trung".`,
        action: {
          type: "start_focus",
          executed: false,
          label: en ? "Session already active" : "Đã có phiên đang chạy",
        },
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }

    const snapshot = await getAgentTodayPlan(request);
    const matchedTask = intent.taskQuery
      ? findMatchingPlanTask(snapshot, intent.taskQuery)
      : snapshot.plan?.tasks.find((t) => t.kind === "must_do" && t.status !== "completed") ??
        snapshot.plan?.tasks.find((t) => t.status !== "completed") ??
        null;

    const mode =
      intent.plannedMinutes === 25
        ? "pomodoro_25_5"
        : intent.plannedMinutes === 50
          ? "pomodoro_50_10"
          : "custom";

    await startFocusSession(
      {
        taskId: matchedTask?.taskId ?? null,
        mode,
        plannedMinutes: intent.plannedMinutes,
      },
      request,
    );

    const taskSuffix = matchedTask
      ? en
        ? ` for "${matchedTask.title}"`
        : ` cho việc "${matchedTask.title}"`
      : "";

    return {
      reply: en
        ? `Started a ${intent.plannedMinutes}m focus session${taskSuffix}. Distraction gates are armed across Web, PC, and Android.`
        : `Đã bắt đầu phiên tập trung ${intent.plannedMinutes} phút${taskSuffix} và đồng bộ khóa cổng trên Web, PC & Android.`,
      action: {
        type: "start_focus",
        executed: true,
        label: `Focus ${intent.plannedMinutes}p`,
      },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "pause_focus") {
    const active = await getActiveSession(request);
    if (!active || active.status !== "running") {
      return {
        reply: en
          ? "There is no running focus session to pause right now."
          : "Hiện không có phiên tập trung nào đang chạy để tạm dừng.",
        action: { type: "pause_focus", executed: false, label: en ? "No active timer" : "Không có phiên chạy" },
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }
    await pauseFocusSession(active.id, request);
    return {
      reply: en
        ? "Focus session paused. Say \"resume focus\" whenever you are ready."
        : "Đã tạm dừng phiên tập trung. Khi sẵn sàng, bạn chỉ cần nói \"tiếp tục phiên\".",
      action: { type: "pause_focus", executed: true, label: en ? "Paused focus" : "Đã tạm dừng" },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "resume_focus") {
    const active = await getActiveSession(request);
    if (!active || active.status !== "paused") {
      return {
        reply: en
          ? "There is no paused focus session to resume."
          : "Hiện không có phiên tập trung nào đang tạm dừng.",
        action: { type: "resume_focus", executed: false, label: en ? "Nothing paused" : "Không có phiên dừng" },
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }
    await resumeFocusSession(active.id, request);
    return {
      reply: en
        ? "Focus session resumed! Stay locked in."
        : "Đã tiếp tục phiên tập trung. Giữ nhịp nhé!",
      action: { type: "resume_focus", executed: true, label: en ? "Resumed focus" : "Đã tiếp tục" },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "complete_focus") {
    const active = await getActiveSession(request);
    if (!active) {
      return {
        reply: en
          ? "No active focus session found to complete."
          : "Hiện không có phiên tập trung nào đang mở để kết thúc.",
        action: { type: "complete_focus", executed: false, label: en ? "No active session" : "Không có phiên" },
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }
    await completeFocusSession(active.id, request);
    return {
      reply: en
        ? "Focus session completed and logged! Great discipline."
        : "Đã hoàn thành và ghi nhận phiên tập trung! Rất tốt.",
      action: { type: "complete_focus", executed: true, label: en ? "Focus completed" : "Xong phiên Focus" },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "complete_task") {
    const snapshot = await getAgentTodayPlan(request);
    const target = findMatchingPlanTask(snapshot, intent.taskQuery);
    if (!target) {
      return {
        reply: en
          ? `I couldn't find an unfinished task matching "${intent.taskQuery}" in today's plan.`
          : `Tôi chưa tìm thấy nhiệm vụ chưa xong nào khớp với "${intent.taskQuery}" trong kế hoạch hôm nay.`,
        action: { type: "complete_task", executed: false, label: en ? "Task not found" : "Không tìm thấy việc" },
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }
    await completeAgentPlanTask({ planTaskId: target.planTaskId }, request);
    return {
      reply: en
        ? `Marked "${target.title}" as completed and synced across all devices.`
        : `Đã đánh dấu hoàn thành "${target.title}" và đồng bộ trạng thái Cổng trên mọi thiết bị.`,
      action: {
        type: "complete_task",
        executed: true,
        label: en ? `Done: ${target.title}` : `Xong: ${target.title}`,
      },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "unlock_pass") {
    const result = await activateUnlockPass(intent.minutes, request);
    const unlockedUntil = result.unlockPassUntil
      ? new Date(result.unlockPassUntil).toLocaleTimeString(en ? "en-US" : "vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
    return {
      reply: en
        ? `Unlocked a ${intent.minutes}m reward pass${unlockedUntil ? ` until ${unlockedUntil}` : ""}. Enjoy mindfully!`
        : `Đã mở khóa thẻ thưởng ${intent.minutes} phút${unlockedUntil ? ` đến ${unlockedUntil}` : ""}. Hãy tận hưởng có chủ đích nhé!`,
      action: {
        type: "unlock_pass",
        executed: true,
        label: en ? `Unlocked ${intent.minutes}m` : `Mở khóa ${intent.minutes}p`,
      },
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  // Read live state for status_summary, next_move, or general conversation
  const [snapshot, activeSession] = await Promise.all([
    getAgentTodayPlan(request),
    getActiveSession(request),
  ]);

  const tasks = snapshot.plan?.tasks ?? [];
  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const mustRemaining = tasks.filter((t) => t.kind === "must_do" && t.status !== "completed");
  const nextTask = mustRemaining[0] ?? tasks.find((t) => t.status !== "completed") ?? null;

  if (intent.type === "next_move") {
    if (!nextTask) {
      return {
        reply: en
          ? `All ${total} tasks in today's plan are complete! You have ${snapshot.activeGrantMinutes}m in your reward wallet.`
          : `Tuyệt vời! Bạn đã hoàn thành toàn bộ ${total} việc hôm nay và đang có ${snapshot.activeGrantMinutes} phút thưởng trong ví.`,
        action: { type: "next_move", executed: true, label: en ? "All clear" : "Đã hoàn thành hết" },
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }
    return {
      reply: en
        ? `Best next move: "${nextTask.title}" (${nextTask.kind === "must_do" ? "Must-do" : "Task"}). Say "start focus 25 minutes" to lock in right now.`
        : `Việc ưu tiên số 1 lúc này là "${nextTask.title}" (${nextTask.kind === "must_do" ? "Bắt buộc" : "Kế hoạch"}). Bạn có thể nói "bắt đầu tập trung 25 phút" để vào việc ngay.`,
      action: {
        type: "next_move",
        executed: true,
        label: nextTask.title.slice(0, 32),
      },
      shouldRefresh: false,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "status_summary") {
    const activeNote = activeSession
      ? en
        ? ` Active focus: ${activeSession.taskTitle ?? `${activeSession.plannedMinutes}m`} (${activeSession.status}).`
        : ` Đang tập trung: ${activeSession.taskTitle ?? `${activeSession.plannedMinutes}p`}.`
      : "";

    return {
      reply: en
        ? `Today: ${completed}/${total} tasks done (${mustRemaining.length} Must-do left). Gate is ${snapshot.unlocked ? "unlocked" : "guarded"}. Wallet: ${snapshot.activeGrantMinutes}m.${activeNote}`
        : `Hôm nay bạn đã xong ${completed}/${total} việc (còn ${mustRemaining.length} việc Bắt buộc). Cổng đang ${snapshot.unlocked ? "mở" : "bảo vệ"}, ví thưởng có ${snapshot.activeGrantMinutes} phút.${activeNote}`,
      action: {
        type: "status_summary",
        executed: true,
        label: `${completed}/${total} · ${snapshot.activeGrantMinutes}p`,
      },
      shouldRefresh: false,
      provider: "focusgate-engine",
    };
  }

  // General conversation: try optional Gemini/OpenAI if configured
  const contextSummary = buildContextSummary(
    snapshot,
    activeSession ? `${activeSession.taskTitle ?? `${activeSession.plannedMinutes}m`} (${activeSession.status})` : null,
  );
  const llm = await callOptionalLlm(intent.prompt, contextSummary, en);
  if (llm) {
    return {
      reply: llm.reply,
      action: null,
      shouldRefresh: false,
      provider: llm.provider,
    };
  }

  return {
    reply: en
      ? `You have ${mustRemaining.length} Must-do task(s) left today (${completed}/${total} done) and ${snapshot.activeGrantMinutes}m in your wallet. Try saying: "Start focus 25 minutes", "Add task read 20m", "Complete task ...", or "What's next?".`
      : `Hôm nay bạn còn ${mustRemaining.length} việc Bắt buộc (${completed}/${total} đã xong), ví thưởng ${snapshot.activeGrantMinutes}p. Bạn có thể nói hoặc gõ: "Tập trung 25 phút", "Thêm việc đọc sách 20p", "Hoàn thành việc ...", hoặc "Hôm nay còn gì?".`,
    action: null,
    shouldRefresh: false,
    provider: "focusgate-engine",
  };
}
