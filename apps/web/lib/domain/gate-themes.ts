export type GateThemeId = "stone" | "bronze" | "obsidian" | "emerald" | "gold";

export interface GateThemeSpec {
  id: GateThemeId;
  requiredStreak: number;
  nameEn: string;
  nameVi: string;
  accentHex: string;
  frameHex: string;
  glowHex: string;
  descriptionEn: string;
  descriptionVi: string;
}

export const GATE_THEMES: GateThemeSpec[] = [
  {
    id: "stone",
    requiredStreak: 0,
    nameEn: "Ancient Stone",
    nameVi: "Đá Cổ Điển",
    accentHex: "#B91C1C",
    frameHex: "#2A2122",
    glowHex: "rgba(185, 28, 28, 0.22)",
    descriptionEn: "Classic crimson seal & carved stone pillars.",
    descriptionVi: "Ấn đỏ thẫm cổ điển và trụ đá khắc mộc.",
  },
  {
    id: "bronze",
    requiredStreak: 7,
    nameEn: "Forged Bronze",
    nameVi: "Đồng Đỏ Rèn",
    accentHex: "#C2410C",
    frameHex: "#3B241A",
    glowHex: "rgba(194, 65, 12, 0.28)",
    descriptionEn: "Unlocked at 7-day streak. Warm hammered bronze.",
    descriptionVi: "Mở khóa ở chuỗi 7 ngày. Ánh đồng đỏ ấm áp.",
  },
  {
    id: "obsidian",
    requiredStreak: 14,
    nameEn: "Obsidian Monolith",
    nameVi: "Hắc Diện Thạch",
    accentHex: "#7C3AED",
    frameHex: "#181326",
    glowHex: "rgba(124, 58, 237, 0.28)",
    descriptionEn: "Unlocked at 14-day streak. Deep volcanic glass & violet aura.",
    descriptionVi: "Mở khóa ở chuỗi 14 ngày. Đá núi lửa đen tuyền & hào quang tím.",
  },
  {
    id: "emerald",
    requiredStreak: 30,
    nameEn: "Emerald Citadel",
    nameVi: "Ngọc Lục Bảo",
    accentHex: "#059669",
    frameHex: "#122620",
    glowHex: "rgba(5, 150, 105, 0.28)",
    descriptionEn: "Unlocked at 30-day streak. Serene jade & mastery glow.",
    descriptionVi: "Mở khóa ở chuỗi 30 ngày. Ngọc lục bảo tinh khiết của sự làm chủ.",
  },
  {
    id: "gold",
    requiredStreak: 60,
    nameEn: "Solar Gold",
    nameVi: "Vàng Ròng Thái Dương",
    accentHex: "#D97706",
    frameHex: "#2B2110",
    glowHex: "rgba(217, 119, 6, 0.34)",
    descriptionEn: "Unlocked at 60-day streak. Legendary gilded gate.",
    descriptionVi: "Mở khóa ở chuỗi 60 ngày. Cánh cổng hoàng kim huyền thoại.",
  },
];

export function isGateThemeUnlocked(themeId: GateThemeId, bestStreak: number): boolean {
  const spec = GATE_THEMES.find((t) => t.id === themeId);
  if (!spec) return false;
  return bestStreak >= spec.requiredStreak;
}

export function getGateThemeSpec(themeId: string | null | undefined): GateThemeSpec {
  return GATE_THEMES.find((t) => t.id === themeId) ?? GATE_THEMES[0]!;
}

export interface FocusQuestTemplate {
  key: "bedtime_7d" | "deep_work_10h" | "consistency_21d";
  titleEn: string;
  titleVi: string;
  descriptionEn: string;
  descriptionVi: string;
  targetValue: number;
  unitEn: string;
  unitVi: string;
}

export const FOCUS_QUEST_CATALOG: FocusQuestTemplate[] = [
  {
    key: "bedtime_7d",
    titleEn: "7 Nights Clean Sleep",
    titleVi: "7 Đêm Giờ Ngủ Sạch",
    descriptionEn: "Keep Bedtime Gate active & log 7 days of focus momentum.",
    descriptionVi: "Duy trì Bedtime Gate sau 23:00 và hoàn thành 7 ngày kỷ luật.",
    targetValue: 7,
    unitEn: "days",
    unitVi: "ngày",
  },
  {
    key: "deep_work_10h",
    titleEn: "10-Hour Deep Work Sprint",
    titleVi: "Chiến Dịch 10 Giờ Tập Trung Sâu",
    descriptionEn: "Accumulate 600 verified focus minutes in a single week.",
    descriptionVi: "Tích lũy 600 phút tập trung hợp lệ để rèn sức bền trí não.",
    targetValue: 600,
    unitEn: "min",
    unitVi: "phút",
  },
  {
    key: "consistency_21d",
    titleEn: "21-Day Gatekeeper Ritual",
    titleVi: "Nghi Thức Giữ Cổng 21 Ngày",
    descriptionEn: "Complete 21 daily plans to forge an unbreakable habit.",
    descriptionVi: "Hoàn thành 21 ngày khóa cổng để hình thành thói quen bền vững.",
    targetValue: 21,
    unitEn: "days",
    unitVi: "ngày",
  },
];
