import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  agentCreateTaskSchema,
  agentPlanLifecycleSchema,
} from "../lib/domain/agent-mobile-schemas.ts";

describe("agent mobile API schemas", () => {
  it("validates quick-add task payload and defaults kind, focus minutes, and addToTodayPlan", () => {
    const parsed = agentCreateTaskSchema.safeParse({ title: "  Đọc tài liệu mới  " });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.title, "Đọc tài liệu mới");
      assert.equal(parsed.data.kind, "must_do");
      assert.equal(parsed.data.requiredFocusMinutes, 0);
      assert.equal(parsed.data.addToTodayPlan, true);
    }

    assert.equal(agentCreateTaskSchema.safeParse({ title: "   " }).success, false);
    assert.equal(
      agentCreateTaskSchema.safeParse({ title: "Valid", requiredFocusMinutes: 500 }).success,
      false,
    );
  });

  it("validates plan lifecycle action payload", () => {
    assert.equal(
      agentPlanLifecycleSchema.safeParse({ action: "confirm_and_activate" }).success,
      true,
    );
    assert.equal(
      agentPlanLifecycleSchema.safeParse({
        action: "complete_and_claim",
        deviceId: "11111111-1111-4111-8111-111111111111",
      }).success,
      true,
    );
    assert.equal(
      agentPlanLifecycleSchema.safeParse({ action: "unknown_action" }).success,
      false,
    );
  });
});
