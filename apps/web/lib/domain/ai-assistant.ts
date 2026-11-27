import type { TaskKind } from "@/lib/data/types";

export type AiIntent =
  | { type: "create_task"; title: string; estimatedMinutes: number; kind: TaskKind }
  | { type: "start_focus"; plannedMinutes: number; taskQuery?: string }
  | { type: "pause_focus" }
  | { type: "resume_focus" }
  | { type: "complete_focus" }
  | { type: "complete_task"; taskQuery: string }
  | { type: "unlock_pass"; minutes: number }
  | { type: "status_summary" }
  | { type: "next_move" }
  | { type: "general"; prompt: string };

export interface AiActionResult {
  type: AiIntent["type"];
  executed: boolean;
  label: string;
}

export interface AiChatResponse {
  reply: string;
  action: AiActionResult | null;
  shouldRefresh: boolean;
  provider: "focusgate-engine" | "gemini" | "openai";
}

const SPOKEN_VI_NUMBERS: Array<[RegExp, string]> = [
  [/\bmột trăm hai mươi\b/gi, "120"],
  [/\bchín mươi\b/gi, "90"],
  [/\bsáu mươi\b/gi, "60"],
  [/\bnăm mươi\b/gi, "50"],
  [/\bbốn mươi lăm\b/gi, "45"],
  [/\bbốn mươi\b/gi, "40"],
  [/\bba mươi lăm\b/gi, "35"],
  [/\bba mươi\b/gi, "30"],
  [/\bhai mươi lăm\b/gi, "25"],
  [/\bhai lăm\b/gi, "25"],
  [/\bhai mươi\b/gi, "20"],
  [/\bmười lăm\b/gi, "15"],
  [/\bmười\b/gi, "10"],
  [/\bnăm\b/gi, "5"],
  [/\btwenty[\s-]?five\b/gi, "25"],
  [/\bforty[\s-]?five\b/gi, "45"],
  [/\bfifty\b/gi, "50"],
  [/\bthirty\b/gi, "30"],
  [/\btwenty\b/gi, "20"],
  [/\bfifteen\b/gi, "15"],
  [/\bten\b/gi, "10"],
  [/\bfive\b/gi, "5"],
];

/**
 * Normalizes voice-transcribed or typed input:
 * - trims wake words / filler prefixes ("FocusGate ơi", "AI ơi", "giúp tôi", "please")
 * - converts common spoken numbers ("hai mươi lăm phút" -> "25 phút")
 * - strips trailing punctuation added by SpeechRecognition
 */
export function normalizeVoiceInput(raw: string): string {
  let text = raw.trim().replace(/\s+/g, " ");
  text = text.replace(/^(hey\s+)?(focus\s*gate|focusgate|trợ lý|ai)(\s+ơi)?[\s,.:;!-]*/i, "");
  text = text.replace(/^(hãy|giúp\s+(tôi|mình|anh|em)|làm\s+ơn|vui\s+lòng|please|can\s+you|could\s+you)\s+/i, "");
  text = text.replace(/[.!?。]+$/g, "").trim();

  for (const [pattern, replacement] of SPOKEN_VI_NUMBERS) {
    text = text.replace(pattern, replacement);
  }
  return text.trim();
}

function extractDurationMinutes(text: string, fallback: number, min = 5, max = 180): number {
  const hourMatch = text.match(/\b(\d{1,2})\s*(giờ|tiếng|h|hr|hour|hours)\b/i);
  if (hourMatch) {
    const mins = Number(hourMatch[1]) * 60;
    return Math.min(max, Math.max(min, mins));
  }
  const minMatch = text.match(/\b(\d{1,3})\s*(phút|phut|p|m|min|mins|minute|minutes)\b/i);
  if (minMatch) {
    const mins = Number(minMatch[1]);
    return Math.min(max, Math.max(min, mins));
  }
  return fallback;
}

function stripDurationSuffix(text: string): string {
  return text
    .replace(/\b\d{1,3}\s*(phút|phut|p|m|min|mins|minute|minutes|giờ|tiếng|h|hr|hours?)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[-–:,]+$/g, "")
    .trim();
}

export function normalizeVietnameseMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAiIntent(rawInput: string): AiIntent {
  const cleaned = normalizeVoiceInput(rawInput);
  const lower = cleaned.toLowerCase();

  // 1. Pause focus
  if (
    /^(tạm dừng|tam dung|dừng tạm|pause)\b/i.test(lower) &&
    /(focus|tập trung|tap trung|phiên|phien|đồng hồ|dong ho|timer|session)?/i.test(lower) &&
    !/\b(thêm|tạo|add|create)\b/i.test(lower)
  ) {
    return { type: "pause_focus" };
  }

  // 2. Resume focus
  if (/^(tiếp tục|tiep tuc|resume|chạy tiếp|chay tiep)\b/i.test(lower)) {
    return { type: "resume_focus" };
  }

  // 3. Complete active focus session
  if (
    /(xong|hoàn thành|hoan thanh|kết thúc|ket thuc|finish|complete|end)\s+(phiên|phien|buổi|buoi)?\s*(tập trung|tap trung|focus|timer|session)/i.test(
      lower,
    )
  ) {
    return { type: "complete_focus" };
  }

  // 4. Unlock pass / spend reward minutes
  if (
    /(mở khóa|mo khoa|dùng|dung|xài|xai|lấy|lay|unlock|spend|use)\b.*\b(giải trí|giai tri|thưởng|thuong|ví|vi|pass|reward|phút|phut|p|min|m)\b/i.test(
      lower,
    ) &&
    /(mở khóa|mo khoa|giải trí|giai tri|thưởng|thuong|unlock|pass|reward)/i.test(lower)
  ) {
    const minutes = extractDurationMinutes(cleaned, 10, 5, 60);
    return { type: "unlock_pass", minutes };
  }

  // 5. Create task
  const createMatch = cleaned.match(
    /^(?:thêm|them|tạo|tao|nhắc\s+(?:tôi|mình)\s+làm|nhac\s+(?:toi|minh)\s+lam|add|create|new)\s+(?:nhiệm vụ|nhiem vu|công việc|cong viec|việc|viec|task|todo)?\s*[:\-]?\s*(.+)$/i,
  );
  if (createMatch?.[1]) {
    const rawRest = createMatch[1].trim();
    const estimatedMinutes = extractDurationMinutes(rawRest, 25, 5, 240);
    let kind: TaskKind = "must_do";
    if (/\b(nên làm|nen lam|should\s*do)\b/i.test(rawRest)) kind = "should_do";
    else if (/\b(thưởng|thuong|bonus|phụ|phu)\b/i.test(rawRest)) kind = "bonus";

    const title = stripDurationSuffix(
      rawRest.replace(/\b(bắt buộc|bat buoc|must\s*do|nên làm|nen lam|should\s*do|bonus)\b/gi, ""),
    );
    if (title.length >= 2) {
      return { type: "create_task", title: title.slice(0, 140), estimatedMinutes, kind };
    }
  }

  // 6. Complete a specific task
  const completeTaskMatch = cleaned.match(
    /^(?:hoàn thành|hoan thanh|đánh dấu xong|danh dau xong|xong|tick|check|complete|finish|mark\s+done)\s+(?:nhiệm vụ|nhiem vu|công việc|cong viec|việc|viec|task)?\s*[:\-]?\s*(.+)$/i,
  );
  if (completeTaskMatch?.[1]) {
    const taskQuery = completeTaskMatch[1].trim();
    if (taskQuery.length >= 2) {
      return { type: "complete_task", taskQuery };
    }
  }

  // 7. Start focus session
  if (
    /^(?:bắt đầu|bat dau|bật|bat|chạy|chay|vào|vao|bấm giờ|bam gio|start|begin|run)?\s*(?:phiên|phien)?\s*(?:tập trung|tap trung|focus|pomodoro|làm việc sâu|deep work)\b/i.test(
      lower,
    ) ||
    /\b(?:bắt đầu|bat dau|start)\s+(?:tập trung|tap trung|focus|pomodoro)\b/i.test(lower)
  ) {
    const plannedMinutes = extractDurationMinutes(cleaned, 25, 5, 180);
    const taskPart = cleaned.match(/(?:cho việc|việc|task|về|for)\s+(.+)$/i)?.[1];
    const taskQuery = taskPart ? stripDurationSuffix(taskPart) : undefined;
    return {
      type: "start_focus",
      plannedMinutes,
      taskQuery: taskQuery && taskQuery.length >= 2 ? taskQuery : undefined,
    };
  }

  // 8. Next move / recommendation
  if (
    /(làm gì tiếp|lam gi tiep|việc tiếp theo|viec tiep theo|ưu tiên|uu tien|gợi ý|goi y|what('?s)? next|next task|next move|recommend)/i.test(
      lower,
    )
  ) {
    return { type: "next_move" };
  }

  // 9. Status / Today summary
  if (
    /(hôm nay|hom nay|tiến độ|tien do|còn việc|con viec|còn gì|con gi|trạng thái|trang thai|tổng quan|tong quan|báo cáo|bao cao|ví thưởng|vi thuong|today|status|summary|progress|overview|how am i doing)/i.test(
      lower,
    )
  ) {
    return { type: "status_summary" };
  }

  return { type: "general", prompt: cleaned || rawInput.trim() };
}
