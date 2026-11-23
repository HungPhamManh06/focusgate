"use server";

import {
  completeTask,
  createTask,
  deleteTask,
  reopenTask,
  updateTask,
  type TaskInput,
} from "@/lib/data/tasks";
import { friendlyDbError } from "@/lib/data/errors";
import {
  dateInputToIso,
  taskFormSchema,
  type TaskFormValues,
} from "@/lib/validation";
import { revalidateWorkspace } from "./shared";
import { firstIssue, type ActionState } from "./types";

function toInput(values: TaskFormValues): TaskInput {
  return {
    title: values.title,
    description: values.description.length > 0 ? values.description : null,
    category: values.category,
    kind: values.kind,
    priority: values.priority,
    estimatedMinutes: values.estimatedMinutes,
    requiredFocusMinutes: values.requiredFocusMinutes,
    dueDate: dateInputToIso(values.dueDate),
    isDailyHabit: Boolean(values.isDailyHabit),
  };
}

function readForm(formData: FormData) {
  return {
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category") ?? "work",
    kind: formData.get("kind") ?? "should_do",
    priority: formData.get("priority") ?? "medium",
    estimatedMinutes: formData.get("estimatedMinutes") ?? 25,
    requiredFocusMinutes: formData.get("requiredFocusMinutes") ?? 20,
    dueDate: formData.get("dueDate") ?? "",
    isDailyHabit: formData.get("isDailyHabit") === "on",
  };
}

export async function createTaskAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = taskFormSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await createTask(toInput(parsed.data));
    revalidateWorkspace();
    return { success: "Task created." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function updateTaskAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Task id is missing." };

  const parsed = taskFormSchema.safeParse(readForm(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };

  try {
    await updateTask(id, toInput(parsed.data));
    revalidateWorkspace();
    return { success: "Task updated." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function completeTaskAction(taskId: string): Promise<ActionState> {
  try {
    const result = await completeTask(taskId);
    revalidateWorkspace();
    return {
      success: result.viaPlan
        ? "Task completed with verified focus time."
        : "Task completed.",
    };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function reopenTaskAction(taskId: string): Promise<ActionState> {
  try {
    await reopenTask(taskId);
    revalidateWorkspace();
    return { success: "Task reopened." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}

export async function deleteTaskAction(taskId: string): Promise<ActionState> {
  try {
    await deleteTask(taskId);
    revalidateWorkspace();
    return { success: "Task deleted." };
  } catch (error) {
    return { error: friendlyDbError(error) };
  }
}
