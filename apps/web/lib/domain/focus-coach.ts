import type { DayPoint, HourlyPoint, TaskCategory, TaskKind } from "../data/types.ts";
import { breakdownGoalIntoTasks, type SuggestedSubtask } from "./smart-breakdown.ts";

export interface HealthSleepDay {
  date: string;
  sleepMinutes: number;
}

export interface PlanTemplateItem {
  title: string;
  titleVi: string;
  category: TaskCategory;
  kind: TaskKind;
  estimatedMinutes: number;
}

export interface BuiltInPlanTemplate {
  id: string;
  name: string;
  nameVi: string;
  description: string;
  descriptionVi: string;
  items: PlanTemplateItem[];
}

export const BUILT_IN_PLAN_TEMPLATES: BuiltInPlanTemplate[] = [
  {
    id: "sys-deep-work",
    name: "Deep Work Day",
    nameVi: "Ngày làm việc sâu",
    description: "2 high-leverage deep work blocks + quick admin sweep.",
    descriptionVi: "2 khối làm việc sâu trọng tâm + 1 khối xử lý việc vặt nhanh.",
    items: [
      {
        title: "Deep Work Block #1 — Most important deliverable",
        titleVi: "Khối tập trung sâu #1 — Đầu việc quan trọng nhất",
        category: "work",
        kind: "must_do",
        estimatedMinutes: 60,
      },
      {
        title: "Deep Work Block #2 — Secondary core milestone",
        titleVi: "Khối tập trung sâu #2 — Hạng mục cốt lõi thứ hai",
        category: "work",
        kind: "must_do",
        estimatedMinutes: 45,
      },
      {
        title: "Inbox zero & admin sweep",
        titleVi: "Dọn hộp thư & xử lý việc hành chính",
        category: "work",
        kind: "should_do",
        estimatedMinutes: 20,
      },
    ],
  },
  {
    id: "sys-exam-prep",
    name: "Exam Prep Sprint",
    nameVi: "Ngày ôn thi tập trung",
    description: "Structured active recall, practice test, and mistake review.",
    descriptionVi: "Ôn kiến thức cốt lõi, luyện đề bấm giờ và tổng hợp lỗi sai.",
    items: [
      {
        title: "Active recall & summary notes for core chapter",
        titleVi: "Ôn chủ động & tóm tắt chương trọng tâm",
        category: "study",
        kind: "must_do",
        estimatedMinutes: 45,
      },
      {
        title: "Timed practice problems / mock questions",
        titleVi: "Luyện bài tập / giải đề bấm giờ",
        category: "study",
        kind: "must_do",
        estimatedMinutes: 45,
      },
      {
        title: "Review mistakes & create flashcards",
        titleVi: "Rà soát lỗi sai & tạo thẻ ghi nhớ",
        category: "study",
        kind: "should_do",
        estimatedMinutes: 25,
      },
    ],
  },
  {
    id: "sys-recovery-weekend",
    name: "Recovery & Reset Weekend",
    nameVi: "Cuối tuần hồi phục & sắp xếp",
    description: "Light movement, personal reset, and next-week planning.",
    descriptionVi: "Vận động nhẹ, dọn dẹp không gian và chuẩn bị cho tuần mới.",
    items: [
      {
        title: "30-minute walk, run, or mobility workout",
        titleVi: "Đi bộ, chạy nhẹ hoặc giãn cơ 30 phút",
        category: "health",
        kind: "must_do",
        estimatedMinutes: 30,
      },
      {
        title: "Weekly Review & clear desk / digital clutter",
        titleVi: "Tổng kết tuần & dọn bàn làm việc",
        category: "personal",
        kind: "must_do",
        estimatedMinutes: 25,
      },
      {
        title: "Read 20 pages offline",
        titleVi: "Đọc 20 trang sách không màn hình",
        category: "personal",
        kind: "bonus",
        estimatedMinutes: 25,
      },
    ],
  },
];

export interface CapacityAnalysis {
  plannedMinutes: number;
  remainingMinutesToday: number;
  overCapacityMinutes: number;
  isOverCapacity: boolean;
}

export function computeCapacityAnalysis(
  pendingEstimatedMinutes: number,
  nowHour = new Date().getHours(),
  nowMinute = new Date().getMinutes(),
  endOfDayHour = 22,
): CapacityAnalysis {
  const nowTotal = nowHour * 60 + nowMinute;
  const endTotal = endOfDayHour * 60;
  const remainingMinutesToday = Math.max(0, endTotal - nowTotal);
  const plannedMinutes = Math.max(0, Math.round(pendingEstimatedMinutes));
  const overCapacityMinutes = Math.max(0, plannedMinutes - remainingMinutesToday);
  return {
    plannedMinutes,
    remainingMinutesToday,
    overCapacityMinutes,
    isOverCapacity: overCapacityMinutes > 0 && plannedMinutes > 0,
  };
}

export interface SleepFocusCorrelation {
  lowSleepDays: number;
  goodSleepDays: number;
  lowSleepAvgFocus: number;
  goodSleepAvgFocus: number;
  lowSleepAvgTasks: number;
  goodSleepAvgTasks: number;
  focusDropPercent: number | null;
}

export interface CoachInsight {
  id: string;
  tone: "accent" | "success" | "warning";
  titleEn: string;
  titleVi: string;
  bodyEn: string;
  bodyVi: string;
}

export function computeSleepCorrelation(
  days: ReadonlyArray<DayPoint>,
  healthDays: ReadonlyArray<HealthSleepDay>,
): SleepFocusCorrelation {
  const healthByDate = new Map(healthDays.map((h) => [h.date, h]));
  let lowSleepDays = 0;
  let goodSleepDays = 0;
  let lowFocusSum = 0;
  let goodFocusSum = 0;
  let lowTasksSum = 0;
  let goodTasksSum = 0;

  for (const day of days) {
    const h = healthByDate.get(day.date);
    if (!h || h.sleepMinutes <= 0) continue;
    const sleepHours = h.sleepMinutes / 60;
    if (sleepHours < 6.5) {
      lowSleepDays += 1;
      lowFocusSum += day.focusMinutes;
      lowTasksSum += day.tasksCompleted;
    } else {
      goodSleepDays += 1;
      goodFocusSum += day.focusMinutes;
      goodTasksSum += day.tasksCompleted;
    }
  }

  const lowSleepAvgFocus = lowSleepDays > 0 ? Math.round(lowFocusSum / lowSleepDays) : 0;
  const goodSleepAvgFocus = goodSleepDays > 0 ? Math.round(goodFocusSum / goodSleepDays) : 0;
  const lowSleepAvgTasks = lowSleepDays > 0 ? Math.round((lowTasksSum / lowSleepDays) * 10) / 10 : 0;
  const goodSleepAvgTasks = goodSleepDays > 0 ? Math.round((goodTasksSum / goodSleepDays) * 10) / 10 : 0;

  let focusDropPercent: number | null = null;
  if (lowSleepDays > 0 && goodSleepDays > 0 && goodSleepAvgFocus > 0) {
    focusDropPercent = Math.round(
      ((goodSleepAvgFocus - lowSleepAvgFocus) / goodSleepAvgFocus) * 100,
    );
  }

  return {
    lowSleepDays,
    goodSleepDays,
    lowSleepAvgFocus,
    goodSleepAvgFocus,
    lowSleepAvgTasks,
    goodSleepAvgTasks,
    focusDropPercent,
  };
}

export function generateWeeklyCoachInsights(input: {
  days: ReadonlyArray<DayPoint>;
  healthDays: ReadonlyArray<HealthSleepDay>;
  hourlyFocus: ReadonlyArray<HourlyPoint>;
  blockedAttempts: number;
  completionRate: number;
}): CoachInsight[] {
  const insights: CoachInsight[] = [];

  // 1. Golden Focus Hour
  const peakHour = [...input.hourlyFocus].sort((a, b) => b.focusMinutes - a.focusMinutes)[0];
  if (peakHour && peakHour.focusMinutes > 0) {
    const startLabel = `${String(peakHour.hour).padStart(2, "0")}:00`;
    const endLabel = `${String((peakHour.hour + 1) % 24).padStart(2, "0")}:00`;
    insights.push({
      id: "golden-hour",
      tone: "accent",
      titleEn: `Your Golden Hour is ${startLabel}–${endLabel}`,
      titleVi: `Khung giờ vàng của bạn là ${startLabel}–${endLabel}`,
      bodyEn: `You logged ${peakHour.focusMinutes}m of deep focus in this window. Protect it by dragging your hardest Must-Do task here.`,
      bodyVi: `Bạn đạt ${peakHour.focusMinutes} phút tập trung sâu ở khung giờ này. Hãy kéo nhiệm vụ Bắt buộc khó nhất vào đây.`,
    });
  }

  // 2. Sleep vs Focus correlation
  const corr = computeSleepCorrelation(input.days, input.healthDays);
  if (corr.focusDropPercent !== null && corr.focusDropPercent > 10) {
    insights.push({
      id: "sleep-impact",
      tone: "warning",
      titleEn: `Sleep under 6.5h cuts your focus by ${corr.focusDropPercent}%`,
      titleVi: `Ngủ dưới 6.5 tiếng làm giảm ${corr.focusDropPercent}% hiệu suất tập trung`,
      bodyEn: `On well-rested days you average ${corr.goodSleepAvgFocus}m focus vs ${corr.lowSleepAvgFocus}m on short-sleep days. Consider enabling Bedtime Gate at 23:00.`,
      bodyVi: `Ngày ngủ đủ bạn tập trung TB ${corr.goodSleepAvgFocus}p so với ${corr.lowSleepAvgFocus}p khi thiếu ngủ. Hãy bật Giờ Ngủ (Bedtime Gate) lúc 23:00.`,
    });
  } else {
    insights.push({
      id: "consistency-pulse",
      tone: "success",
      titleEn: `Completion momentum: ${input.completionRate}%`,
      titleVi: `Đà hoàn thành kế hoạch: ${input.completionRate}%`,
      bodyEn:
        input.completionRate >= 70
          ? "Strong follow-through. Keep your daily Must-Do list at 2–3 focused tasks to protect your streak."
          : "Try reducing your daily Must-Do list to 2 concrete tasks and splitting anything over 45 minutes.",
      bodyVi:
        input.completionRate >= 70
          ? "Đà kỷ luật rất tốt! Giữ danh sách Bắt buộc ở mức 2–3 việc trọng tâm để bảo vệ chuỗi ngày."
          : "Thử rút gọn danh sách Bắt buộc xuống 2 việc thật cụ thể và tách nhỏ mọi việc trên 45 phút.",
    });
  }

  // 3. Distraction shield insight
  if (input.blockedAttempts > 0) {
    insights.push({
      id: "distraction-shield",
      tone: "warning",
      titleEn: `FocusGate intercepted ${input.blockedAttempts} distraction attempts`,
      titleVi: `FocusGate đã chặn đứng ${input.blockedAttempts} lần xao nhãng`,
      bodyEn: "Every intercepted urge saved 10–15 minutes of context-switching. Enable Strict Friction Mode on Android if urges spike.",
      bodyVi: "Mỗi lần chặn kịp thời giúp bạn tiết kiệm 10–15 phút mất đà. Bật Chế độ Nghiêm khắc trên Android nếu hay xin mở sớm.",
    });
  } else {
    insights.push({
      id: "clean-shield",
      tone: "success",
      titleEn: "Clean focus shield this period",
      titleVi: "Lá chắn tập trung sạch bóng xao nhãng",
      bodyEn: "Zero blocked distraction attempts recorded. Keep syncing Android & Browser Extension for full visibility.",
      bodyVi: "Chưa ghi nhận lần cố mở app/web bị chặn nào. Duy trì đồng bộ Android & Extension để theo dõi đầy đủ.",
    });
  }

  return insights.slice(0, 3);
}

export function buildMicroStepsForStalledTask(taskTitle: string): SuggestedSubtask[] {
  const raw = breakdownGoalIntoTasks(taskTitle);
  return raw.slice(0, 3).map((step, idx) => ({
    ...step,
    estimatedMinutes: idx === 0 ? 10 : 15,
    kind: idx === 0 ? "must_do" : "should_do",
  }));
}
