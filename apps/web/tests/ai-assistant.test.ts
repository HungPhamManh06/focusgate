import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isAffirmativeConfirmation,
  normalizeVoiceInput,
  parseAiIntent,
} from "../lib/domain/ai-assistant.ts";

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

test("parseAiIntent parses compound Web UI + Focus command", () => {
  const compound = parseAiIntent("Mở phần tập trung lên và chạy 25m");
  assert.deepEqual(compound, {
    type: "start_focus",
    plannedMinutes: 25,
    openFocusPage: true,
  });

  assert.deepEqual(parseAiIntent("Mở trang thống kê"), {
    type: "navigate",
    path: "/statistics",
    label: "Mở Thống kê",
  });

  assert.deepEqual(parseAiIntent("Bật chế độ tối"), {
    type: "set_theme",
    mode: "dark",
  });
});

test("parseAiIntent parses browser/app/system Omni-Controller commands", () => {
  const yt = parseAiIntent("Mở Chrome và vào YouTube cho tôi");
  assert.deepEqual(yt, {
    type: "device_command",
    command: {
      type: "open_url_in_browser",
      targetPlatform: "any",
      browser: "chrome",
      url: "https://www.youtube.com",
      domain: "youtube.com",
      isDistraction: true,
      label: "CHROME → YouTube",
    },
  });

  const todoist = parseAiIntent("mở google chrome và mở todoist");
  assert.deepEqual(todoist, {
    type: "device_command",
    command: {
      type: "open_url_in_browser",
      targetPlatform: "any",
      browser: "chrome",
      url: "https://app.todoist.com",
      domain: "todoist.com",
      isDistraction: false,
      label: "CHROME → Todoist",
    },
  });

  const vscode = parseAiIntent("Mở VS Code trên máy tính");
  assert.deepEqual(vscode, {
    type: "device_command",
    command: {
      type: "launch_app",
      targetPlatform: "windows",
      appName: "VS Code",
      isDistraction: false,
      label: "Mở VS Code",
    },
  });

  const mute = parseAiIntent("Tắt âm lượng");
  assert.deepEqual(mute, {
    type: "device_command",
    command: {
      type: "media_control",
      targetPlatform: "any",
      action: "mute",
      label: "Tắt/Bật tiếng",
    },
  });

  assert.equal(isAffirmativeConfirmation("Có"), true);
  assert.equal(isAffirmativeConfirmation("Mở đi"), true);
});

test("parseAiIntent parses Vietnamese and English create_task, complete_task, unlock_pass", () => {
  assert.deepEqual(parseAiIntent("Thêm việc đọc sách tiếng Anh 30 phút."), {
    type: "create_task",
    title: "đọc sách tiếng Anh",
    estimatedMinutes: 30,
    kind: "must_do",
  });

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
});
