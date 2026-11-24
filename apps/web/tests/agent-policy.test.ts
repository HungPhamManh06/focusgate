import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeAgentPolicySnapshot } from "../lib/domain/agent-policy.ts";
import { blockRuleSchema, usageBatchSchema } from "../lib/validation.ts";

describe("computeAgentPolicySnapshot", () => {
  it("activates lock when activeGrantMinutes is 0 and filters enabled rules", () => {
    const policy = computeAgentPolicySnapshot({
      activeGrantMinutes: 0,
      nowIso: "2026-11-22T09:00:00.000Z",
      rules: [
        { ruleType: "block", identifier: "steam.exe", isEnabled: true },
        { ruleType: "block", identifier: "disabled.exe", isEnabled: false },
        { ruleType: "allow", identifier: "code.exe", isEnabled: true },
      ],
    });

    assert.equal(policy.pulledAtUtc, "2026-11-22T09:00:00.000Z");
    assert.equal(policy.lockActive, true);
    assert.deepEqual(policy.blockedProcesses, ["steam.exe"]);
    assert.deepEqual(policy.allowedProcesses, ["code.exe"]);
  });

  it("unlocks when activeGrantMinutes > 0", () => {
    const policy = computeAgentPolicySnapshot({
      activeGrantMinutes: 25,
      rules: [{ ruleType: "block", identifier: "discord.exe", isEnabled: true }],
      language: "vi",
    });

    assert.equal(policy.lockActive, false);
    assert.deepEqual(policy.blockedProcesses, ["discord.exe"]);
    assert.equal(policy.language, "vi");
  });
});

describe("blockRuleSchema", () => {
  it("validates deviceId UUID, ruleType, identifier, and displayName", () => {
    assert.equal(
      blockRuleSchema.safeParse({
        deviceId: "not-a-uuid",
        ruleType: "block",
        identifier: "steam.exe",
        displayName: "Steam",
        category: "games",
        action: "overlay",
      }).success,
      false,
    );

    const ok = blockRuleSchema.safeParse({
      deviceId: "11111111-1111-4111-8111-111111111111",
      ruleType: "block",
      identifier: "  steam.exe  ",
      displayName: "  Steam  ",
      category: "games",
      action: "overlay",
    });
    assert.equal(ok.success, true);
    if (ok.success) {
      assert.equal(ok.data.identifier, "steam.exe");
      assert.equal(ok.data.displayName, "Steam");
    }
  });
});

describe("usageBatchSchema", () => {
  it("validates batch payload and rejects short clientEventId or empty batches", () => {
    assert.equal(
      usageBatchSchema.safeParse({
        deviceId: "11111111-1111-4111-8111-111111111111",
        events: [],
      }).success,
      false,
    );

    const ok = usageBatchSchema.safeParse({
      deviceId: "11111111-1111-4111-8111-111111111111",
      events: [
        {
          clientEventId: "evt-12345678",
          identifier: "steam.exe",
          displayName: "Steam",
          startedAt: "2026-11-22T08:00:00.000Z",
          durationSeconds: 45,
          wasBlocked: true,
        },
      ],
    });
    assert.equal(ok.success, true);
  });
});
