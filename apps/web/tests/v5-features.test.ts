import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseIcsEventsForDate, totalBusyMinutes } from "../lib/domain/ics-parser.ts";
import {
  FOCUS_QUEST_CATALOG,
  GATE_THEMES,
  isGateThemeUnlocked,
} from "../lib/domain/gate-themes.ts";

describe("FocusGate v5 domain helpers", () => {
  it("parses RFC 5545 ICS events for a target date and computes total busy minutes", () => {
    const sampleIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:evt-1",
      "SUMMARY:Operating Systems Lecture",
      "DTSTART:20261125T090000",
      "DTEND:20261125T103000",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:evt-2",
      "SUMMARY:Tomorrow Meeting",
      "DTSTART:20261126T140000",
      "DTEND:20261126T150000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const events = parseIcsEventsForDate(sampleIcs, "2026-11-25");
    assert.equal(events.length, 1);
    assert.equal(events[0]?.summary, "Operating Systems Lecture");
    assert.equal(events[0]?.startHhMm, "09:00");
    assert.equal(events[0]?.endHhMm, "10:30");
    assert.equal(totalBusyMinutes(events), 90);
  });

  it("unlocks evolving Living Gate themes by streak milestone", () => {
    assert.equal(GATE_THEMES.length, 5);
    assert.equal(isGateThemeUnlocked("stone", 0), true);
    assert.equal(isGateThemeUnlocked("bronze", 6), false);
    assert.equal(isGateThemeUnlocked("bronze", 7), true);
    assert.equal(isGateThemeUnlocked("gold", 59), false);
    assert.equal(isGateThemeUnlocked("gold", 60), true);
    assert.equal(FOCUS_QUEST_CATALOG.length, 3);
  });
});
