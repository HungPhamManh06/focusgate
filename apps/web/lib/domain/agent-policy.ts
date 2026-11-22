export interface BlockRuleSummary {
  ruleType: "block" | "allow";
  identifier: string;
  isEnabled: boolean;
}

export interface AgentPolicyPayload {
  pulledAtUtc: string;
  lockActive: boolean;
  blockedProcesses: string[];
  allowedProcesses: string[];
}

export function computeAgentPolicySnapshot(input: {
  activeGrantMinutes: number;
  rules: ReadonlyArray<BlockRuleSummary>;
  nowIso?: string;
}): AgentPolicyPayload {
  const activeGrantMinutes = Math.max(0, Math.floor(input.activeGrantMinutes));
  const blockedProcesses: string[] = [];
  const allowedProcesses: string[] = [];

  for (const rule of input.rules) {
    if (!rule.isEnabled) continue;
    const id = rule.identifier.trim();
    if (!id) continue;
    if (rule.ruleType === "block") {
      blockedProcesses.push(id);
    } else if (rule.ruleType === "allow") {
      allowedProcesses.push(id);
    }
  }

  return {
    pulledAtUtc: input.nowIso ?? new Date().toISOString(),
    lockActive: activeGrantMinutes <= 0,
    blockedProcesses,
    allowedProcesses,
  };
}
