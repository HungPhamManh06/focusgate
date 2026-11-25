export type SealTier = "gold" | "crimson" | "ember" | "empty";

export interface DailySeal {
  date: string;
  label: string;
  tier: SealTier;
  focusMinutes: number;
  tasksCompleted: number;
  sleepMinutes: number | null;
}

export interface FocusPassportSummary {
  seals: DailySeal[];
  goldCount: number;
  sealedCount: number;
  currentStreak: number;
}

export function buildDailySeals(
  statsDays: ReadonlyArray<{
    date: string;
    label: string;
    focusMinutes: number;
    tasksCompleted?: number;
  }>,
  healthDays: ReadonlyArray<{
    date: string;
    sleepMinutes: number;
  }> = [],
): FocusPassportSummary {
  const sleepByDate = new Map<string, number>();
  for (const h of healthDays) {
    sleepByDate.set(h.date, h.sleepMinutes);
  }

  const seals: DailySeal[] = statsDays.map((day) => {
    const focusMinutes = Math.max(0, Math.round(day.focusMinutes));
    const tasksCompleted = Math.max(0, Math.round(day.tasksCompleted ?? 0));
    const sleepMinutes = sleepByDate.has(day.date) ? (sleepByDate.get(day.date) ?? null) : null;

    let tier: SealTier = "empty";
    const strongFocus = focusMinutes >= 90 || (focusMinutes >= 45 && tasksCompleted >= 3);
    const rested = sleepMinutes === null ? focusMinutes >= 120 : sleepMinutes >= 420;

    if (strongFocus && rested) {
      tier = "gold";
    } else if (focusMinutes >= 25 || tasksCompleted >= 1) {
      tier = "crimson";
    } else if (focusMinutes > 0) {
      tier = "ember";
    }

    return {
      date: day.date,
      label: day.label,
      tier,
      focusMinutes,
      tasksCompleted,
      sleepMinutes,
    };
  });

  let currentStreak = 0;
  for (let i = seals.length - 1; i >= 0; i -= 1) {
    const seal = seals[i];
    if (seal && (seal.tier === "gold" || seal.tier === "crimson")) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  const goldCount = seals.filter((s) => s.tier === "gold").length;
  const sealedCount = seals.filter((s) => s.tier !== "empty").length;

  return {
    seals,
    goldCount,
    sealedCount,
    currentStreak,
  };
}
