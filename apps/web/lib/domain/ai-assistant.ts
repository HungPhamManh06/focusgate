import type { TaskKind } from "@/lib/data/types";

export type TargetPlatform = "windows" | "android" | "any";

export type AiClientCommand =
  | { type: "navigate"; path: string; label: string }
  | { type: "set_theme"; mode: "dark" | "light" | "toggle"; label: string }
  | { type: "open_url"; url: string; label: string };

export type AiDeviceCommand =
  | {
      type: "open_url_in_browser";
      targetPlatform: TargetPlatform;
      browser?: string;
      url: string;
      domain?: string;
      isDistraction?: boolean;
      label: string;
    }
  | {
      type: "launch_app";
      targetPlatform: TargetPlatform;
      appName: string;
      isDistraction?: boolean;
      label: string;
    }
  | {
      type: "close_app";
      targetPlatform: TargetPlatform;
      appName: string;
      label: string;
    }
  | {
      type: "media_control";
      targetPlatform: TargetPlatform;
      action: "volume_up" | "volume_down" | "mute" | "play_pause" | "next" | "prev";
      label: string;
    }
  | {
      type: "system_action";
      targetPlatform: TargetPlatform;
      action: "lock_pc" | "toggle_floating_timer" | "open_sanctuary" | "set_alarm" | "set_timer";
      minutes?: number;
      hour?: number;
      minute?: number;
      label: string;
    };

export interface AiPendingConfirmation {
  type: "unlock_and_run";
  minutes: number;
  command: AiDeviceCommand;
  buttonLabel: string;
}

export type AiIntent =
  | { type: "create_task"; title: string; estimatedMinutes: number; kind: TaskKind }
  | { type: "start_focus"; plannedMinutes: number; taskQuery?: string; openFocusPage?: boolean }
  | { type: "pause_focus" }
  | { type: "resume_focus" }
  | { type: "complete_focus" }
  | { type: "complete_task"; taskQuery: string }
  | { type: "unlock_pass"; minutes: number }
  | { type: "status_summary" }
  | { type: "next_move" }
  | { type: "navigate"; path: string; label: string }
  | { type: "set_theme"; mode: "dark" | "light" | "toggle" }
  | { type: "device_command"; command: AiDeviceCommand }
  | { type: "general"; prompt: string };

export interface AiActionResult {
  type: string;
  executed: boolean;
  label: string;
}

export interface AiSummaryCard {
  completed: number;
  total: number;
  mustRemaining: number;
  unlocked: boolean;
  walletMinutes: number;
  nextTaskTitle?: string | null;
}

export interface AiChatResponse {
  reply: string;
  action: AiActionResult | null;
  clientCommands?: AiClientCommand[];
  deviceCommand?: AiDeviceCommand | null;
  pendingConfirmation?: AiPendingConfirmation | null;
  summaryCard?: AiSummaryCard | null;
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

const KNOWN_SITES: Array<{ keys: string[]; url: string; domain: string; label: string; distraction: boolean }> = [
  { keys: ["youtube", "yt", "du túp"], url: "https://www.youtube.com", domain: "youtube.com", label: "YouTube", distraction: true },
  { keys: ["facebook", "fb"], url: "https://www.facebook.com", domain: "facebook.com", label: "Facebook", distraction: true },
  { keys: ["tiktok", "tik tok"], url: "https://www.tiktok.com", domain: "tiktok.com", label: "TikTok", distraction: true },
  { keys: ["instagram", "ig"], url: "https://www.instagram.com", domain: "instagram.com", label: "Instagram", distraction: true },
  { keys: ["reddit"], url: "https://www.reddit.com", domain: "reddit.com", label: "Reddit", distraction: true },
  { keys: ["netflix"], url: "https://www.netflix.com", domain: "netflix.com", label: "Netflix", distraction: true },
  { keys: ["twitch"], url: "https://www.twitch.tv", domain: "twitch.tv", label: "Twitch", distraction: true },
  { keys: ["twitter", "x.com"], url: "https://x.com", domain: "x.com", label: "X", distraction: true },
  { keys: ["soundcloud", "sound cloud"], url: "https://soundcloud.com", domain: "soundcloud.com", label: "SoundCloud", distraction: false },
  { keys: ["zing mp3", "zingmp3"], url: "https://zingmp3.vn", domain: "zingmp3.vn", label: "Zing MP3", distraction: false },
  { keys: ["nhaccuatui"], url: "https://www.nhaccuatui.com", domain: "nhaccuatui.com", label: "NhacCuaTui", distraction: false },
  { keys: ["canva"], url: "https://www.canva.com", domain: "canva.com", label: "Canva", distraction: false },
  { keys: ["figma"], url: "https://www.figma.com", domain: "figma.com", label: "Figma", distraction: false },
  { keys: ["vercel"], url: "https://vercel.com", domain: "vercel.com", label: "Vercel", distraction: false },
  { keys: ["supabase"], url: "https://supabase.com/dashboard", domain: "supabase.com", label: "Supabase", distraction: false },
  { keys: ["claude"], url: "https://claude.ai", domain: "claude.ai", label: "Claude", distraction: false },
  { keys: ["gmail", "mail"], url: "https://mail.google.com", domain: "mail.google.com", label: "Gmail", distraction: false },
  { keys: ["google docs", "docs"], url: "https://docs.google.com", domain: "docs.google.com", label: "Google Docs", distraction: false },
  { keys: ["google drive", "drive"], url: "https://drive.google.com", domain: "drive.google.com", label: "Google Drive", distraction: false },
  { keys: ["github"], url: "https://github.com", domain: "github.com", label: "GitHub", distraction: false },
  { keys: ["chatgpt"], url: "https://chatgpt.com", domain: "chatgpt.com", label: "ChatGPT", distraction: false },
  { keys: ["gemini"], url: "https://gemini.google.com", domain: "gemini.google.com", label: "Gemini", distraction: false },
  { keys: ["google translate", "dịch", "translate"], url: "https://translate.google.com", domain: "translate.google.com", label: "Google Translate", distraction: false },
  { keys: ["todoist"], url: "https://app.todoist.com", domain: "todoist.com", label: "Todoist", distraction: false },
  { keys: ["trello"], url: "https://trello.com", domain: "trello.com", label: "Trello", distraction: false },
  { keys: ["leetcode"], url: "https://leetcode.com", domain: "leetcode.com", label: "LeetCode", distraction: false },
  { keys: ["duolingo"], url: "https://www.duolingo.com", domain: "duolingo.com", label: "Duolingo", distraction: false },
  { keys: ["stackoverflow", "stack overflow"], url: "https://stackoverflow.com", domain: "stackoverflow.com", label: "Stack Overflow", distraction: false },
  { keys: ["wikipedia", "wiki"], url: "https://vi.wikipedia.org", domain: "wikipedia.org", label: "Wikipedia", distraction: false },
  { keys: ["spotify"], url: "https://open.spotify.com", domain: "open.spotify.com", label: "Spotify", distraction: false },
  { keys: ["google"], url: "https://www.google.com", domain: "google.com", label: "Google", distraction: false },
];

const DISTRACTION_APPS = new Set([
  "tiktok",
  "facebook",
  "instagram",
  "youtube",
  "netflix",
  "steam",
  "epic games",
  "valorant",
  "league of legends",
  "genshin",
  "discord",
  "reddit",
  "twitch",
  "shopee",
]);

export function normalizeVoiceInput(raw: string): string {
  let text = raw.trim().replace(/\s+/g, " ");
  text = text.replace(/^(hey\s+)?(focus\s*gate|focusgate|trợ lý|ai)(\s+ơi)?[\s,.:;!-]*/i, "");
  text = text.replace(/^(hãy|giúp\s+(tôi|mình|anh|em)|làm\s+ơn|vui\s+lòng|please|can\s+you|could\s+you)\s+/i, "");
  text = text.replace(/(\s+(cho\s+(tôi|mình|anh|em)|giúp\s+(tôi|mình)|nhé|nha|đi|với|please))+$/i, "");
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

function detectTargetPlatform(lower: string): TargetPlatform {
  if (/(trên điện thoại|tren dien thoai|trên android|tren android|on phone|on android)/i.test(lower)) {
    return "android";
  }
  if (/(trên máy tính|tren may tinh|trên pc|tren pc|trên windows|tren windows|on pc|on windows|on computer)/i.test(lower)) {
    return "windows";
  }
  return "any";
}

function detectBrowser(lower: string): string | undefined {
  if (/\bchrome\b/i.test(lower)) return "chrome";
  if (/\bedge\b/i.test(lower)) return "edge";
  if (/\bfirefox\b/i.test(lower)) return "firefox";
  if (/\bbrave\b/i.test(lower)) return "brave";
  if (/(cốc cốc|coc coc|coccoc)/i.test(lower)) return "coccoc";
  return undefined;
}

export function isAffirmativeConfirmation(raw: string): boolean {
  const norm = normalizeVietnameseMatch(normalizeVoiceInput(raw));
  return /^(co|dong y|ok|okay|oke|duoc|mo|mo di|mo ngay|dung 10p|yes|yeah|sure|go ahead|confirm)$/.test(norm);
}

export function parseAiIntent(rawInput: string): AiIntent {
  const cleaned = normalizeVoiceInput(rawInput);
  const lower = cleaned.toLowerCase();
  const targetPlatform = detectTargetPlatform(lower);

  // 1. Compound "Mở phần tập trung (lên) và chạy 25m" / "Open focus and run 25m"
  if (
    /(mở|mo|vào|vao|bật|bat|open)\s+(phần|phan|trang|mục|muc|tab)?\s*(tập trung|tap trung|focus)/i.test(lower) &&
    /(chạy|chay|bắt đầu|bat dau|run|start|đếm|dem|\d+\s*(phút|phut|p|m|min))/i.test(lower)
  ) {
    const plannedMinutes = extractDurationMinutes(cleaned, 25, 5, 180);
    return { type: "start_focus", plannedMinutes, openFocusPage: true };
  }

  // 2. Web search command ("tìm kiếm ... trên google", "search ... on google")
  const searchMatch = cleaned.match(
    /^(?:tìm kiếm|tim kiem|search|google)\s+(.+?)(?:\s+(?:trên|tren|on)\s+(?:google|chrome|youtube|yt))?$/i,
  );
  if (searchMatch?.[1] && !/^(việc|nhiệm vụ|task)/i.test(searchMatch[1])) {
    const query = searchMatch[1].trim();
    const isYt = /(youtube|yt)\b/i.test(lower);
    const url = isYt
      ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
      : `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return {
      type: "device_command",
      command: {
        type: "open_url_in_browser",
        targetPlatform,
        browser: detectBrowser(lower) ?? "chrome",
        url,
        domain: isYt ? "youtube.com" : "google.com",
        isDistraction: isYt,
        label: isYt ? `YouTube: ${query}` : `Google: ${query}`,
      },
    };
  }

  // 3. Open browser + website ("mở google chrome và mở todoist", "mở chrome và vào youtube", "mở soundcloud")
  const browser = detectBrowser(lower);
  const lowerWithoutBrowser = lower
    .replace(/\b(google\s+chrome|microsoft\s+edge|chrome|edge|firefox|brave|cốc\s+cốc|coc\s+coc|coccoc)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const explicitUrlMatch = cleaned.match(/https?:\/\/[^\s]+|\b([a-z0-9-]+\.(?:com|vn|org|net|io|dev|ai|edu|gov)(?:\/[^\s]*)?)\b/i);
  const matchedSite = KNOWN_SITES.find((site) =>
    site.keys.some((k) => {
      if (k === "spotify" && !browser) return false; // Let standalone "open spotify" launch desktop Spotify app first
      return lowerWithoutBrowser.includes(k);
    }),
  );
  const hasOpenVerb = /(?:^|\s)(?:mở|mo|vào|vao|chạy|chay|open|launch|go to)(?:\s|$)/i.test(lower);

  if (hasOpenVerb && (browser || matchedSite || explicitUrlMatch)) {
    let url = matchedSite?.url ?? "";
    let domain = matchedSite?.domain;
    let label = matchedSite?.label ?? "";
    let isDistraction = matchedSite?.distraction ?? false;

    if (explicitUrlMatch) {
      const rawUrl = explicitUrlMatch[0];
      url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        domain = rawUrl;
      }
      label = domain;
      isDistraction = KNOWN_SITES.some((s) => s.distraction && domain?.includes(s.domain));
    }

    // If user said "mở google chrome và mở/vào <site>" for any unlisted website name (e.g. "mở chrome và mở dribbble")
    if (!url && browser) {
      const afterBrowserMatch = cleaned.match(
        /(?:google\s+chrome|microsoft\s+edge|chrome|edge|firefox|brave|cốc\s+cốc|coccoc)\s*(?:và|va|rồi|roi|,|and)?\s*(?:mở|mo|vào|vao|truy cập|truy cap|open|go to|visit)?\s*(?:trang|web|website)?\s*([a-z0-9-]+)$/i,
      );
      const guessedSite = afterBrowserMatch?.[1]?.trim().toLowerCase();
      if (guessedSite && guessedSite.length >= 2) {
        url = `https://${guessedSite}.com`;
        domain = `${guessedSite}.com`;
        label = guessedSite.charAt(0).toUpperCase() + guessedSite.slice(1);
        isDistraction = KNOWN_SITES.some((s) => s.distraction && domain?.includes(s.domain));
      }
    }

    if (url) {
      return {
        type: "device_command",
        command: {
          type: "open_url_in_browser",
          targetPlatform,
          browser,
          url,
          domain,
          isDistraction,
          label: browser ? `${browser.toUpperCase()} → ${label}` : `Mở ${label}`,
        },
      };
    }

    if (browser) {
      return {
        type: "device_command",
        command: {
          type: "launch_app",
          targetPlatform,
          appName: browser,
          isDistraction: false,
          label: `Mở ${browser}`,
        },
      };
    }
  }

  // 4. Pause / Resume / Complete focus
  if (
    /^(tạm dừng|tam dung|dừng tạm|pause)\b/i.test(lower) &&
    !/(nhạc|music|bài|media|video)/i.test(lower) &&
    !/\b(thêm|tạo|add|create)\b/i.test(lower)
  ) {
    return { type: "pause_focus" };
  }

  if (/^(tiếp tục|tiep tuc|resume|chạy tiếp|chay tiep)\b/i.test(lower) && !/(nhạc|music)/i.test(lower)) {
    return { type: "resume_focus" };
  }

  if (
    /(xong|hoàn thành|hoan thanh|kết thúc|ket thuc|finish|complete|end)\s+(phiên|phien|buổi|buoi)?\s*(tập trung|tap trung|focus|timer|session)/i.test(
      lower,
    )
  ) {
    return { type: "complete_focus" };
  }

  // 5. Media & volume controls
  if (/(tắt âm|tat am|tắt tiếng|tat tieng|mute)/i.test(lower)) {
    return {
      type: "device_command",
      command: { type: "media_control", targetPlatform, action: "mute", label: "Tắt/Bật tiếng" },
    };
  }
  if (/(tăng âm|tang am|to lên|volume up)/i.test(lower)) {
    return {
      type: "device_command",
      command: { type: "media_control", targetPlatform, action: "volume_up", label: "Tăng âm lượng" },
    };
  }
  if (/(giảm âm|giam am|nhỏ lại|volume down)/i.test(lower)) {
    return {
      type: "device_command",
      command: { type: "media_control", targetPlatform, action: "volume_down", label: "Giảm âm lượng" },
    };
  }
  if (/(tạm dừng nhạc|dừng nhạc|phát nhạc|bật nhạc|pause music|play music)/i.test(lower)) {
    return {
      type: "device_command",
      command: { type: "media_control", targetPlatform, action: "play_pause", label: "Phát/Dừng nhạc" },
    };
  }
  if (/(qua bài|chuyển bài|next track|next song)/i.test(lower)) {
    return {
      type: "device_command",
      command: { type: "media_control", targetPlatform, action: "next", label: "Chuyển bài tiếp" },
    };
  }

  // 6. System actions (Lock PC, Alarm, Timer, Sanctuary)
  if (/(khóa màn hình|khoa man hinh|lock pc|lock screen)/i.test(lower)) {
    return {
      type: "device_command",
      command: { type: "system_action", targetPlatform: "windows", action: "lock_pc", label: "Khóa màn hình PC" },
    };
  }
  if (/(đặt báo thức|dat bao thuc|set alarm)/i.test(lower)) {
    const timeMatch = cleaned.match(/(\d{1,2})\s*(?:giờ|gio|h|:)\s*(\d{1,2})?/i);
    const hour = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 7;
    const minute = timeMatch?.[2] ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;
    return {
      type: "device_command",
      command: {
        type: "system_action",
        targetPlatform: "android",
        action: "set_alarm",
        hour,
        minute,
        label: `Báo thức ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      },
    };
  }
  if (/(hẹn giờ|hen gio|set timer)/i.test(lower)) {
    const minutes = extractDurationMinutes(cleaned, 10, 1, 180);
    return {
      type: "device_command",
      command: {
        type: "system_action",
        targetPlatform: "android",
        action: "set_timer",
        minutes,
        label: `Hẹn giờ ${minutes}p`,
      },
    };
  }
  if (/(toàn màn hình|toan man hinh|sanctuary)/i.test(lower)) {
    return {
      type: "device_command",
      command: {
        type: "system_action",
        targetPlatform: "android",
        action: "open_sanctuary",
        label: "Mở Focus Sanctuary",
      },
    };
  }

  // 7. Theme switching on Web App
  if (/(chế độ tối|che do toi|giao diện tối|giao dien toi|dark mode)/i.test(lower)) {
    return { type: "set_theme", mode: "dark" };
  }
  if (/(chế độ sáng|che do sang|giao diện sáng|giao dien sang|light mode)/i.test(lower)) {
    return { type: "set_theme", mode: "light" };
  }

  // 8. Web App navigation
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|đi tới|di toi|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:tập trung|tap trung|focus)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/focus", label: "Mở trang Tập trung" };
  }
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:nhiệm vụ|nhiem vu|công việc|tasks)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/tasks", label: "Mở trang Nhiệm vụ" };
  }
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:kế hoạch|ke hoach|planner)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/planner", label: "Mở Kế hoạch" };
  }
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:ví thưởng|vi thuong|ví|wallet)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/wallet", label: "Mở Ví thưởng" };
  }
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:thống kê|thong ke|statistics|stats)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/statistics", label: "Mở Thống kê" };
  }
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:thiết bị|thiet bi|devices)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/devices", label: "Mở Thiết bị" };
  }
  if (/^(?:mở|mo|vào|vao|chuyển sang|chuyen sang|open|go to)\s+(?:phần|phan|trang|mục|muc|tab)?\s*(?:cài đặt|cai dat|settings)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/settings", label: "Mở Cài đặt" };
  }
  if (/^(?:về|ve|mở|mo|go to)\s+(?:trang chủ|trang chu|tổng quan|tong quan|dashboard|home)(?:\s|$)/i.test(lower)) {
    return { type: "navigate", path: "/", label: "Về Tổng quan" };
  }

  // 9. Unlock pass / spend reward minutes
  if (
    /(mở khóa|mo khoa|dùng|dung|xài|xai|lấy|lay|unlock|spend|use)\b.*\b(giải trí|giai tri|thưởng|thuong|ví|vi|pass|reward|phút|phut|p|min|m)\b/i.test(
      lower,
    ) &&
    /(mở khóa|mo khoa|giải trí|giai tri|thưởng|thuong|unlock|pass|reward)/i.test(lower)
  ) {
    const minutes = extractDurationMinutes(cleaned, 10, 5, 60);
    return { type: "unlock_pass", minutes };
  }

  // 10. Create task
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

  // 11. Complete a specific task
  const completeTaskMatch = cleaned.match(
    /^(?:hoàn thành|hoan thanh|đánh dấu xong|danh dau xong|xong|tick|check|complete|finish|mark\s+done)\s+(?:nhiệm vụ|nhiem vu|công việc|cong viec|việc|viec|task)?\s*[:\-]?\s*(.+)$/i,
  );
  if (completeTaskMatch?.[1]) {
    const taskQuery = completeTaskMatch[1].trim();
    if (taskQuery.length >= 2) {
      return { type: "complete_task", taskQuery };
    }
  }

  // 12. Close an app on PC
  const closeAppMatch = cleaned.match(
    /^(?:đóng|dong|tắt|tat|close|quit|exit)\s+(?:ứng dụng|ung dung|phần mềm|phan mem|app)?\s*(.+)$/i,
  );
  if (closeAppMatch?.[1]) {
    const appName = closeAppMatch[1]
      .replace(/\s+(trên máy tính|trên pc|trên điện thoại|on pc|on windows|on phone)$/i, "")
      .trim();
    if (appName.length >= 2 && !/^(âm|tiếng|nhạc|cổng|phiên)/i.test(appName)) {
      return {
        type: "device_command",
        command: {
          type: "close_app",
          targetPlatform: targetPlatform === "any" ? "windows" : targetPlatform,
          appName,
          label: `Đóng ${appName}`,
        },
      };
    }
  }

  // 13. Launch any app on PC or Android ("Mở VS Code", "Mở Spotify", "Mở Zalo trên điện thoại")
  const launchAppMatch = cleaned.match(
    /^(?:mở|mo|chạy|chay|khởi động|khoi dong|open|launch|start)\s+(?:ứng dụng|ung dung|phần mềm|phan mem|app)?\s*(.+)$/i,
  );
  if (
    launchAppMatch?.[1] &&
    !/^(tập trung|tap trung|focus|pomodoro|phiên|phien|khóa|khoa)/i.test(launchAppMatch[1])
  ) {
    const appName = launchAppMatch[1]
      .replace(/\s+(trên máy tính|trên pc|trên windows|trên điện thoại|trên android|on pc|on windows|on phone|on android)$/i, "")
      .trim();
    if (appName.length >= 2) {
      const normApp = appName.toLowerCase();
      const isDistraction = Array.from(DISTRACTION_APPS).some((d) => normApp.includes(d));
      return {
        type: "device_command",
        command: {
          type: "launch_app",
          targetPlatform,
          appName,
          isDistraction,
          label: `Mở ${appName}`,
        },
      };
    }
  }

  // 14. Start focus session
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
      openFocusPage: true,
    };
  }

  // 15. Next move / recommendation
  if (
    /(làm gì tiếp|lam gi tiep|việc tiếp theo|viec tiep theo|ưu tiên|uu tien|gợi ý|goi y|what('?s)? next|next task|next move|recommend)/i.test(
      lower,
    )
  ) {
    return { type: "next_move" };
  }

  // 16. Status / Today summary
  if (
    /(hôm nay|hom nay|tiến độ|tien do|còn việc|con viec|còn gì|con gi|trạng thái|trang thai|tổng quan|tong quan|báo cáo|bao cao|ví thưởng|vi thuong|today|status|summary|progress|overview|how am i doing)/i.test(
      lower,
    )
  ) {
    return { type: "status_summary" };
  }

  return { type: "general", prompt: cleaned || rawInput.trim() };
}
