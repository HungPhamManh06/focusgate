import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDailySeals } from "../lib/domain/focus-passport.ts";

describe("buildDailySeals", () => {
  it("classifies gold, crimson, ember, and empty days and calculates trailing streak", () => {
    const result = buildDailySeals(
      [
        { date: "2026-11-21", label: "Sat", focusMinutes: 0 },
        { date: "2026-11-22", label: "Sun", focusMinutes: 15 },
        { date: "2026-11-23", label: "Mon", focusMinutes: 45 },
        { date: "2026-11-24", label: "Tue", focusMinutes: 100 },
      ],
      [
        { date: "2026-11-23", sleepMinutes: 400 },
        { date: "2026-11-24", sleepMinutes: 450 },
      ],
    );

    assert.equal(result.seals[0]?.tier, "empty");
    assert.equal(result.seals[1]?.tier, "ember");
    assert.equal(result.seals[2]?.tier, "crimson");
    assert.equal(result.seals[3]?.tier, "gold");
    assert.equal(result.goldCount, 1);
    assert.equal(result.sealedCount, 3);
    assert.equal(result.currentStreak, 2);
  });

  it("resets streak to 0 when the latest day has no crimson/gold seal", () => {
    const result = buildDailySeals([
      { date: "2026-11-24", label: "Tue", focusMinutes: 120 },
      { date: "2026-11-25", label: "Wed", focusMinutes: 0 },
    ]);

    assert.equal(result.seals[0]?.tier, "gold");
    assert.equal(result.seals[1]?.tier, "empty");
    assert.equal(result.currentStreak, 0);
  });
});
