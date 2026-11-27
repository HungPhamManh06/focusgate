import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeVoiceInput, parseAiIntent } from "../lib/domain/ai-assistant.ts";

test("normalizeVoiceInput strips wake words, punctuation, and spoken numbers", () => {
  assert.equal(
    normalizeVoiceInput("FocusGate ơi, bắt đầu tập trung hai mươi lăm phút."),
    "bắt đầu tập trung 25 phút",
  );
  assert.equal(
    normalizeVoiceInput("Hey FocusGate, please add task read book thirty minutes!"),
    "add task read book 30 minutes",
  );
});

test("parseAiIntent parses Vietnamese and English create_task commands", () => {
  const vi = parseAiIntent("Thêm việc đọc sách tiếng Anh 30 phút.");
  assert.deepEqual(vi, {
    type: "create_task",
    title: "đọc sách tiếng Anh",
    estimatedMinutes: 30,
    kind: "must_do",
  });

  const en = parseAiIntent("Add task Review pull requests 20m");
  assert.deepEqual(en, {
    type: "create_task",
    title: "Review pull requests",
    estimatedMinutes: 20,
    kind: "must_do",
  });
});

test("parseAiIntent parses voice and text focus session commands", () => {
  const viVoice = parseAiIntent("FocusGate ơi, bắt đầu tập trung hai mươi lăm phút.");
  assert.deepEqual(viVoice, {
    type: "start_focus",
    plannedMinutes: 25,
    taskQuery: undefined,
  });

  const enStart = parseAiIntent("Start focus 45 minutes for math homework");
  assert.deepEqual(enStart, {
    type: "start_focus",
    plannedMinutes: 45,
    taskQuery: "math homework",
  });

  assert.deepEqual(parseAiIntent("Tạm dừng tập trung"), { type: "pause_focus" });
  assert.deepEqual(parseAiIntent("Tiếp tục phiên"), { type: "resume_focus" });
  assert.deepEqual(parseAiIntent("Hoàn thành phiên tập trung"), { type: "complete_focus" });
});

test("parseAiIntent parses complete_task, unlock_pass, status_summary, and next_move", () => {
  assert.deepEqual(parseAiIntent("Hoàn thành việc giặt quần áo."), {
    type: "complete_task",
    taskQuery: "giặt quần áo",
  });

  assert.deepEqual(parseAiIntent("Mở khóa 10 phút giải trí"), {
    type: "unlock_pass",
    minutes: 10,
  });

  assert.deepEqual(parseAiIntent("Hôm nay còn việc gì?"), {
    type: "status_summary",
  });

  assert.deepEqual(parseAiIntent("Làm gì tiếp theo?"), {
    type: "next_move",
  });
});
