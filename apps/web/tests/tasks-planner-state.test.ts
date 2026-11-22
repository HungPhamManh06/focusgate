import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPlannerSummaryViewModel,
  findReadyToCompletePlanTasks,
  formatTaskRowStatus,
  resolveInitialFocusTaskId,
} from "../lib/domain/tasks-planner-state.ts";
import { taskFormSchema } from "../lib/validation.ts";

describe("formatTaskRowStatus", () => {
  it("hides overdue warnings and danger/warning priority badges on completed tasks", () => {
    const view = formatTaskRowStatus(
      {
        status: "completed",
        dueDate: "2020-01-01T00:00:00.000Z",
        completedAt: "2026-04-01T10:00:00.000Z",
      },
      "Asia/Ho_Chi_Minh",
    );

    assert.equal(view.completed, true);
    assert.equal(view.showOverdue, false);
    assert.equal(view.showPriorityBadge, false);
    assert.equal(view.dueLabel, null);
    assert.match(view.completedLabel ?? "", /^Completed /);
  });

  it("shows overdue warnings and priority badges on open tasks", () => {
    const view = formatTaskRowStatus(
      {
        status: "todo",
        dueDate: "2020-01-01T00:00:00.000Z",
        completedAt: null,
      },
      "Asia/Ho_Chi_Minh",
    );

    assert.equal(view.completed, false);
    assert.equal(view.showOverdue, true);
    assert.equal(view.showPriorityBadge, true);
    assert.match(view.dueLabel ?? "", /overdue/);
    assert.equal(view.completedLabel, null);
  });
});

describe("buildPlannerSummaryViewModel", () => {
  it("avoids 0/0 and 0% when a plan has no must-do tasks or focus targets", () => {
    const view = buildPlannerSummaryViewModel({
      tasks: [],
      progress: {
        mustDoTotal: 0,
        mustDoCompleted: 0,
        focusRequired: 0,
        focusDone: 0,
        bonusCompleted: 0,
      },
    });

    assert.equal(view.hasMustDos, false);
    assert.equal(view.mustDoHeadline, "Not configured");
    assert.equal(view.mustDoCountLabel, "No Must-dos yet");
    assert.equal(view.headerMetaLine, "0 tasks · No Must-dos yet");
    assert.equal(view.hasFocusTarget, false);
    assert.equal(view.focusDoneLabel, "Not set");
    assert.equal(view.focusTargetSuffix, null);
    assert.equal(view.focusCoverageLabel, "—");
  });

  it("handles must-do tasks that have 0m required focus without showing 0m / 0m or 0%", () => {
    const view = buildPlannerSummaryViewModel({
      tasks: [
        {
          id: "pt-1",
          taskId: "t-1",
          kind: "must_do",
          requiredFocusMinutes: 0,
          completedAt: null,
          title: "Quick task",
          description: null,
          status: "todo",
          priority: "medium",
          focusDone: 0,
        },
      ],
      progress: {
        mustDoTotal: 1,
        mustDoCompleted: 0,
        focusRequired: 0,
        focusDone: 0,
        bonusCompleted: 0,
      },
    });

    assert.equal(view.hasMustDos, true);
    assert.equal(view.mustDoHeadline, "0%");
    assert.equal(view.mustDoCountLabel, "0/1 done");
    assert.equal(view.headerMetaLine, "1 task · 0/1 must-dos done");
    assert.equal(view.hasFocusTarget, false);
    assert.equal(view.focusDoneLabel, "Not set");
    assert.equal(view.focusCoverageLabel, "—");
  });

  it("formats active progress and focus coverage when targets are configured", () => {
    const view = buildPlannerSummaryViewModel({
      tasks: [
        {
          id: "pt-1",
          taskId: "t-1",
          kind: "must_do",
          requiredFocusMinutes: 50,
          completedAt: "2026-04-01T10:00:00.000Z",
          title: "Deep work",
          description: null,
          status: "completed",
          priority: "high",
          focusDone: 50,
        },
        {
          id: "pt-2",
          taskId: "t-2",
          kind: "must_do",
          requiredFocusMinutes: 50,
          completedAt: null,
          title: "Review",
          description: null,
          status: "todo",
          priority: "medium",
          focusDone: 0,
        },
      ],
      progress: {
        mustDoTotal: 2,
        mustDoCompleted: 1,
        focusRequired: 100,
        focusDone: 50,
        bonusCompleted: 0,
      },
    });

    assert.equal(view.hasMustDos, true);
    assert.equal(view.mustDoHeadline, "50%");
    assert.equal(view.mustDoCountLabel, "1/2 done");
    assert.equal(view.headerMetaLine, "2 tasks · 1/2 must-dos done");
    assert.equal(view.hasFocusTarget, true);
    assert.equal(view.focusDoneLabel, "50m");
    assert.equal(view.focusTargetSuffix, "/ 1h 40m");
    assert.equal(view.focusCoverageLabel, "50%");
    assert.equal(view.totalPlanFocusRequired, 100);
    assert.equal(view.totalPlanFocusLabel, "1h 40m");
    assert.equal(view.isOverloaded, false);
  });

  it("flags overload when total required focus across all tasks exceeds 6 hours", () => {
    const view = buildPlannerSummaryViewModel({
      tasks: [
        {
          id: "pt-1",
          taskId: "t-1",
          kind: "must_do",
          requiredFocusMinutes: 240,
          completedAt: null,
          title: "Deep work 1",
          description: null,
          status: "todo",
          priority: "high",
          focusDone: 0,
        },
        {
          id: "pt-2",
          taskId: "t-2",
          kind: "should_do",
          requiredFocusMinutes: 150,
          completedAt: null,
          title: "Deep work 2",
          description: null,
          status: "todo",
          priority: "medium",
          focusDone: 0,
        },
      ],
      progress: {
        mustDoTotal: 1,
        mustDoCompleted: 0,
        focusRequired: 240,
        focusDone: 0,
        bonusCompleted: 0,
      },
    });

    assert.equal(view.totalPlanFocusRequired, 390);
    assert.equal(view.totalPlanFocusLabel, "6h 30m");
    assert.equal(view.isOverloaded, true);
  });
});

describe("resolveInitialFocusTaskId & findReadyToCompletePlanTasks", () => {
  it("prefers valid requestedTaskId from query string, then inTodayPlan, then first candidate", () => {
    const candidates = [
      { id: "t-1", inTodayPlan: false },
      { id: "t-2", inTodayPlan: true },
      { id: "t-3", inTodayPlan: false },
    ];

    assert.equal(resolveInitialFocusTaskId(candidates, "t-3"), "t-3");
    assert.equal(resolveInitialFocusTaskId(candidates, "missing"), "t-2");
    assert.equal(resolveInitialFocusTaskId(candidates, null), "t-2");
    assert.equal(resolveInitialFocusTaskId([{ id: "t-9", inTodayPlan: false }], null), "t-9");
  });

  it("finds active plan tasks whose focus requirement is met and not yet completed", () => {
    const ready = findReadyToCompletePlanTasks({
      status: "active",
      tasks: [
        {
          id: "pt-1",
          taskId: "t-1",
          kind: "must_do",
          requiredFocusMinutes: 25,
          completedAt: null,
          title: "Ready task",
          description: null,
          status: "in_progress",
          priority: "high",
          focusDone: 25,
        },
        {
          id: "pt-2",
          taskId: "t-2",
          kind: "must_do",
          requiredFocusMinutes: 50,
          completedAt: null,
          title: "Incomplete focus",
          description: null,
          status: "todo",
          priority: "medium",
          focusDone: 25,
        },
        {
          id: "pt-3",
          taskId: "t-3",
          kind: "must_do",
          requiredFocusMinutes: 25,
          completedAt: "2026-11-22T07:00:00Z",
          title: "Already done",
          description: null,
          status: "completed",
          priority: "medium",
          focusDone: 25,
        },
      ],
    });

    assert.equal(ready.length, 1);
    assert.equal(ready[0]?.id, "pt-1");
  });
});

describe("taskFormSchema", () => {
  it("rejects requiredFocusMinutes greater than estimatedMinutes", () => {
    const result = taskFormSchema.safeParse({
      title: "Focus task",
      description: "",
      category: "work",
      kind: "must_do",
      priority: "medium",
      estimatedMinutes: 25,
      requiredFocusMinutes: 50,
    });

    assert.equal(result.success, false);
    if (!result.success) {
      assert.match(result.error.issues[0]?.message ?? "", /cannot exceed the estimated duration/i);
    }
  });

  it("accepts requiredFocusMinutes equal to or less than estimatedMinutes", () => {
    const result = taskFormSchema.safeParse({
      title: "Valid task",
      description: "",
      category: "work",
      kind: "must_do",
      priority: "medium",
      estimatedMinutes: 30,
      requiredFocusMinutes: 30,
    });

    assert.equal(result.success, true);
  });
});
