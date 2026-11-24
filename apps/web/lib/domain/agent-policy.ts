export interface BlockRuleSummary {
  ruleType: "block" | "allow";
  identifier: string;
  isEnabled: boolean;
}

export interface EffectiveSchedule {
  isWeekend: boolean;
  bedtimeStart: string | null;
  bedtimeEnd: string | null;
  relaxedMode: boolean;
}

export interface ActiveFocusSummary {
  id: string;
  taskTitle: string | null;
  status: string;
}

export interface AgentPolicyPayload {
  pulledAtUtc: string;
  lockActive: boolean;
  blockedProcesses: string[];
  allowedProcesses: string[];
  unlockPassUntil?: string | null;
  whitelistFocusMode?: boolean;
  allowedDomains?: string[];
  blockedDomains?: string[];
  activeFocusSession?: ActiveFocusSummary | null;
  effectiveSchedule?: EffectiveSchedule;
  earnedMinutesBalance?: number;
  language?: "en" | "vi";
}

export function computeAgentPolicySnapshot(input: {
  activeGrantMinutes: number;
  rules: ReadonlyArray<BlockRuleSummary>;
  nowIso?: string;
  unlockPassUntil?: string | null;
  whitelistFocusMode?: boolean;
  allowedApps?: ReadonlyArray<string>;
  allowedDomains?: ReadonlyArray<string>;
  blockedDomains?: ReadonlyArray<string>;
  activeFocusSession?: ActiveFocusSummary | null;
  effectiveSchedule?: EffectiveSchedule;
  earnedMinutesBalance?: number;
  language?: "en" | "vi";
}): AgentPolicyPayload {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const nowMs = new Date(nowIso).getTime();
  const activeGrantMinutes = Math.max(0, Math.floor(input.activeGrantMinutes));
  const blockedProcesses: string[] = [];
  const allowedSet = new Set<string>();

  for (const app of input.allowedApps ?? []) {
    const trimmed = app.trim();
    if (trimmed) allowedSet.add(trimmed);
  }

  for (const rule of input.rules) {
    if (!rule.isEnabled) continue;
    const id = rule.identifier.trim();
    if (!id) continue;
    if (rule.ruleType === "block") {
      blockedProcesses.push(id);
    } else if (rule.ruleType === "allow") {
      allowedSet.add(id);
    }
  }

  const hasActiveUnlockPass =
    Boolean(input.unlockPassUntil) &&
    new Date(input.unlockPassUntil!).getTime() > nowMs;

  return {
    pulledAtUtc: nowIso,
    lockActive: hasActiveUnlockPass ? false : activeGrantMinutes <= 0,
    blockedProcesses,
    allowedProcesses: Array.from(allowedSet),
    ...(input.unlockPassUntil !== undefined ? { unlockPassUntil: input.unlockPassUntil } : {}),
    ...(input.whitelistFocusMode !== undefined
      ? { whitelistFocusMode: input.whitelistFocusMode }
      : {}),
    ...(input.allowedDomains !== undefined ? { allowedDomains: [...input.allowedDomains] } : {}),
    ...(input.blockedDomains !== undefined ? { blockedDomains: [...input.blockedDomains] } : {}),
    ...(input.activeFocusSession !== undefined
      ? { activeFocusSession: input.activeFocusSession }
      : {}),
    ...(input.effectiveSchedule !== undefined
      ? { effectiveSchedule: input.effectiveSchedule }
      : {}),
    ...(input.earnedMinutesBalance !== undefined
      ? { earnedMinutesBalance: input.earnedMinutesBalance }
      : {}),
    ...(input.language !== undefined ? { language: input.language } : {}),
  };
}
