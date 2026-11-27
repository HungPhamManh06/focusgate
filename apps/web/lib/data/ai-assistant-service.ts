import "server-only";

import {
  completeAgentPlanTask,
  getAgentTodayPlan,
  type AgentPlanSnapshot,
} from "@/lib/data/agent-plan";
import { createAgentTask } from "@/lib/data/agent-tasks";
import { enqueueDeviceCommand } from "@/lib/data/device-commands";
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
  type AiClientCommand,
  type AiDeviceCommand,
} from "@/lib/domain/ai-assistant";

export interface RunFocusGateAiOptions {
  confirmUnlock?: boolean;
  pendingCommand?: AiDeviceCommand | null;
  sourcePlatform?: "web" | "windows" | "android";
}

function isEnglishPrompt(text: string): boolean {
  const hasViDiacritics = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
    text,
  );
  if (hasViDiacritics) return false;
  return /\b(add|create|start|focus|pause|resume|complete|finish|today|status|next|unlock|task|summary|help|what|how|open|launch|close|mute|volume|lock|dark|light)\b/i.test(
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
    ? `You are FocusGate AI — an omni-controller discipline assistant across Web, Windows PC, and Android. Answer concisely in 2-3 sentences based on live FocusGate state:\n${contextSummary}`
    : `Bạn là FocusGate AI — trợ lý kỷ luật điều khiển toàn diện Web, Windows PC và Android. Trả lời bằng tiếng Việt trong 2-3 câu ngắn gọn dựa trên trạng thái hôm nay:\n${contextSummary}`;

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
            generationConfig: { maxOutputTokens: 260, temperature: 0.4 },
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
      // Fall through
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
          max_tokens: 260,
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
      // Fall through
    }
  }

  return null;
}

async function dispatchDeviceCommand(
  command: AiDeviceCommand,
  en: boolean,
  options: RunFocusGateAiOptions,
  request?: Request,
): Promise<AiChatResponse> {
  const isDistraction =
    (command.type === "open_url_in_browser" || command.type === "launch_app") &&
    Boolean(command.isDistraction);

  // Gate-Aware Guardrail: if Gate is locked & target is a distraction, ask to spend 10m from wallet first!
  if (isDistraction) {
    const snapshot = await getAgentTodayPlan(request);
    if (!snapshot.unlocked) {
      if (!options.confirmUnlock) {
        const mustLeft = (snapshot.plan?.tasks ?? []).filter(
          (t) => t.kind === "must_do" && t.status !== "completed",
        ).length;
        return {
          reply: en
            ? `FocusGate is currently locked (${mustLeft} Must-do left). You have ${snapshot.activeGrantMinutes}m in your wallet — would you like to spend 10m to unlock and run "${command.label}"?`
            : `Cổng FocusGate đang khóa (còn ${mustLeft} việc Bắt buộc). Ví thưởng của bạn đang có ${snapshot.activeGrantMinutes} phút — bạn có muốn dùng 10 phút thưởng để mở khóa và thực hiện "${command.label}" không?`,
          action: {
            type: "gate_confirm",
            executed: false,
            label: en ? "Gate locked · Confirm 10m pass" : "Cổng đang khóa · Cần xác nhận 10p",
          },
          clientCommands: [],
          deviceCommand: null,
          pendingConfirmation: {
            type: "unlock_and_run",
            minutes: 10,
            command,
            buttonLabel: en ? "Use 10m & Open Now" : "Dùng 10p thưởng & Mở ngay",
          },
          shouldRefresh: false,
          provider: "focusgate-engine",
        };
      }

      // User confirmed! Spend 10m from reward wallet first.
      try {
        await activateUnlockPass(10, request);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        return {
          reply: en
            ? `Could not unlock 10m pass (${msg || "not enough earned minutes"}). Complete a focus session or Must-do task first!`
            : `Chưa thể dùng 10 phút thưởng (${msg || "không đủ số dư ví thưởng"}). Hãy hoàn thành thêm phiên tập trung hoặc việc Bắt buộc trước nhé!`,
          action: {
            type: "unlock_pass",
            executed: false,
            label: en ? "Insufficient wallet balance" : "Chưa đủ phút thưởng",
          },
          clientCommands: [],
          deviceCommand: null,
          shouldRefresh: false,
          provider: "focusgate-engine",
        };
      }
    }
  }

  // Enqueue into cross-device remote queue if targeting another device (or general remote sync)
  const source = options.sourcePlatform ?? "web";
  const shouldEnqueueRemote =
    (source === "web" && (command.targetPlatform === "windows" || command.targetPlatform === "android")) ||
    (source === "android" && command.targetPlatform === "windows") ||
    (source === "windows" && command.targetPlatform === "android");

  if (shouldEnqueueRemote) {
    await enqueueDeviceCommand(
      {
        targetPlatform: command.targetPlatform,
        commandType: command.type,
        payload: command as unknown as Record<string, unknown>,
      },
      request,
    );
  }

  const clientCommands: AiClientCommand[] = [];
  if (command.type === "open_url_in_browser" && source === "web" && command.targetPlatform !== "android") {
    clientCommands.push({ type: "open_url", url: command.url, label: command.label });
  }

  const targetNote =
    command.targetPlatform === "windows"
      ? en
        ? " on Windows PC"
        : " trên máy tính Windows"
      : command.targetPlatform === "android"
        ? en
          ? " on Android phone"
          : " trên điện thoại Android"
        : "";

  const unlockPrefix = options.confirmUnlock
    ? en
      ? "Unlocked 10m pass and "
      : "Đã dùng 10 phút thưởng và "
    : en
      ? "Executing: "
      : "Đang thực thi: ";

  return {
    reply: `${unlockPrefix}${command.label}${targetNote}.`,
    action: {
      type: command.type,
      executed: true,
      label: command.label,
    },
    clientCommands,
    deviceCommand: command,
    shouldRefresh: Boolean(options.confirmUnlock),
    provider: "focusgate-engine",
  };
}

export async function runFocusGateAi(
  message: string,
  request?: Request,
  options: RunFocusGateAiOptions = {},
): Promise<AiChatResponse> {
  const en = isEnglishPrompt(message);

  // If user confirmed a pending Gate-Aware unlock command
  if (options.confirmUnlock && options.pendingCommand) {
    return dispatchDeviceCommand(options.pendingCommand, en, options, request);
  }

  const intent = parseAiIntent(message);

  if (intent.type === "device_command") {
    return dispatchDeviceCommand(intent.command, en, options, request);
  }

  if (intent.type === "navigate") {
    return {
      reply: en ? `Opening ${intent.label}.` : `Đang chuyển sang ${intent.label}.`,
      action: { type: "navigate", executed: true, label: intent.label },
      clientCommands: [{ type: "navigate", path: intent.path, label: intent.label }],
      shouldRefresh: false,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "set_theme") {
    const label =
      intent.mode === "dark"
        ? en
          ? "Dark mode"
          : "Chế độ tối"
        : en
          ? "Light mode"
          : "Chế độ sáng";
    return {
      reply: en ? `Switched interface to ${label}.` : `Đã chuyển giao diện sang ${label}.`,
      action: { type: "set_theme", executed: true, label },
      clientCommands: [{ type: "set_theme", mode: intent.mode, label }],
      shouldRefresh: false,
      provider: "focusgate-engine",
    };
  }

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
      clientCommands: [],
      shouldRefresh: true,
      provider: "focusgate-engine",
    };
  }

  if (intent.type === "start_focus") {
    const existing = await getActiveSession(request);
    if (existing) {
      return {
        reply: en
          ? `A focus session (${existing.taskTitle ?? `${existing.plannedMinutes}m`}) is already ${existing.status}. Opening the Focus page now.`
          : `Bạn đang có phiên tập trung (${existing.taskTitle ?? `${existing.plannedMinutes}p`}) ở trạng thái ${existing.status === "paused" ? "tạm dừng" : "đang chạy"}. Tôi đang mở trang Tập trung cho bạn.`,
        action: {
          type: "start_focus",
          executed: true,
          label: en ? "Opened active focus" : "Mở phiên đang chạy",
        },
        clientCommands: [{ type: "navigate", path: "/focus", label: en ? "Open Focus" : "Mở Tập trung" }],
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
        ? `Opened Focus and started a ${intent.plannedMinutes}m session${taskSuffix}. Distraction gates are armed across Web, PC, and Android.`
        : `Đã mở phần Tập trung và bắt đầu chạy ${intent.plannedMinutes} phút${taskSuffix}, đồng bộ khóa cổng trên Web, PC & Android.`,
      action: {
        type: "start_focus",
        executed: true,
        label: `Focus ${intent.plannedMinutes}p`,
      },
      clientCommands: intent.openFocusPage
        ? [{ type: "navigate", path: "/focus", label: en ? "Open Focus" : "Mở Tập trung" }]
        : [],
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
        clientCommands: [],
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
      clientCommands: [],
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
        clientCommands: [],
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
      clientCommands: [],
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
        clientCommands: [],
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
      clientCommands: [],
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
        clientCommands: [],
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
      clientCommands: [],
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
      clientCommands: [],
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

  const summaryCard = {
    completed,
    total,
    mustRemaining: mustRemaining.length,
    unlocked: snapshot.unlocked,
    walletMinutes: snapshot.activeGrantMinutes,
    nextTaskTitle: nextTask?.title ?? null,
  };

  if (intent.type === "next_move") {
    if (!nextTask) {
      return {
        reply: en
          ? `All ${total} tasks in today's plan are complete! You have ${snapshot.activeGrantMinutes}m in your reward wallet.`
          : `Tuyệt vời! Bạn đã hoàn thành toàn bộ ${total} việc hôm nay và đang có ${snapshot.activeGrantMinutes} phút thưởng trong ví.`,
        action: { type: "next_move", executed: true, label: en ? "All clear" : "Đã hoàn thành hết" },
        clientCommands: [],
        summaryCard,
        shouldRefresh: false,
        provider: "focusgate-engine",
      };
    }
    return {
      reply: en
        ? `Best next move: "${nextTask.title}" (${nextTask.kind === "must_do" ? "Must-do" : "Task"}). Say "open focus and run 25m" to lock in right now.`
        : `Việc ưu tiên số 1 lúc này là "${nextTask.title}" (${nextTask.kind === "must_do" ? "Bắt buộc" : "Kế hoạch"}). Bạn có thể nói "mở phần tập trung và chạy 25 phút" để vào việc ngay.`,
      action: {
        type: "next_move",
        executed: true,
        label: nextTask.title.slice(0, 32),
      },
      clientCommands: [],
      summaryCard,
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
      clientCommands: [],
      summaryCard,
      shouldRefresh: false,
      provider: "focusgate-engine",
    };
  }

  const contextSummary = buildContextSummary(
    snapshot,
    activeSession ? `${activeSession.taskTitle ?? `${activeSession.plannedMinutes}m`} (${activeSession.status})` : null,
  );
  const llm = await callOptionalLlm(intent.prompt, contextSummary, en);
  if (llm) {
    return {
      reply: llm.reply,
      action: null,
      clientCommands: [],
      shouldRefresh: false,
      provider: llm.provider,
    };
  }

  return {
    reply: en
      ? `Try: "Open focus and run 25m", "Open Chrome and go to YouTube", "Open VS Code", "Dark mode", or "Today's status".`
      : `Bạn có thể ra lệnh: "Mở phần tập trung và chạy 25m", "Mở Chrome và vào YouTube", "Mở VS Code", "Chế độ tối", "Tắt âm lượng", hoặc "Hôm nay còn gì?".`,
    action: null,
    clientCommands: [],
    shouldRefresh: false,
    provider: "focusgate-engine",
  };
}
