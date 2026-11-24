import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generatePinkSample, SOUNDSCAPE_PRESETS } from "../lib/domain/soundscapes.ts";

describe("focus soundscapes", () => {
  it("provides off plus 9 distinct focus soundscapes with bilingual labels and descriptions", () => {
    assert.equal(SOUNDSCAPE_PRESETS.length, 10);
    const ids = new Set(SOUNDSCAPE_PRESETS.map((p) => p.id));
    assert.equal(ids.size, 10);
    assert.equal(SOUNDSCAPE_PRESETS[0]?.id, "off");

    for (const preset of SOUNDSCAPE_PRESETS) {
      assert.ok(preset.label.trim().length > 0);
      assert.ok(preset.labelVi.trim().length > 0);
      assert.ok(preset.description.trim().length > 0);
      assert.ok(preset.descriptionVi.trim().length > 0);
    }
  });

  it("keeps pink noise samples bounded within [-1, 1]", () => {
    const state = { b0: 0, b1: 0, b2: 0, b3: 0, b4: 0, b5: 0, b6: 0 };
    for (let i = 0; i < 5000; i += 1) {
      const white = (i % 2 === 0 ? 1 : -1) * 0.9;
      const sample = generatePinkSample(white, state);
      assert.ok(Number.isFinite(sample));
      assert.ok(sample >= -1 && sample <= 1);
    }
  });
});
