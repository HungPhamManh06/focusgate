"use client";

import { Calendar, Check, Clock, Copy, Plus, Repeat, Save, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { createTaskAction, updateTaskAction } from "@/lib/actions/tasks";
import { EMPTY_ACTION_STATE, type ActionState } from "@/lib/actions/types";
import type { Task } from "@/lib/data/types";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

const initialState: ActionState = {};

export function TaskInspectorDrawer({
  task,
  open,
  onClose,
}: {
  task: Task;
  open: boolean;
  onClose: () => void;
}) {
  const isVi = useLocale() === "vi";
  const toast = useToast();
  const [state, formAction, pending] = useActionState(updateTaskAction, initialState);
  const [dupPending, startDupTransition] = useTransition();
  const [subtasks, setSubtasks] = useState<Array<{ id: string; text: string; done: boolean }>>([]);
  const [newSubtask, setNewSubtask] = useState("");
  const subKey = `focusgate:subtasks:${task.id}`;

  useEffect(() => {
    if (!open) return;
    try {
      const saved = JSON.parse(window.localStorage.getItem(subKey) || "[]") as Array<{
        id: string;
        text: string;
        done: boolean;
      }>;
      if (Array.isArray(saved)) setSubtasks(saved);
    } catch {
      // ignore
    }
  }, [open, subKey]);

  function saveSubtasks(next: Array<{ id: string; text: string; done: boolean }>) {
    setSubtasks(next);
    try {
      window.localStorage.setItem(subKey, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (state.success) {
      toast.push("success", isVi ? "Đã cập nhật nhiệm vụ." : state.success);
      onClose();
    } else if (state.error) {
      toast.push("error", state.error);
    }
  }, [state, toast, onClose, isVi]);

  if (!open) return null;

  const dueDateValue = task.dueDate ? task.dueDate.slice(0, 10) : "";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={isVi ? "Chi tiết nhiệm vụ" : "Task inspector"}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="fg-animate-in flex h-full w-full max-w-md flex-col border-l border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-accent">
              {isVi ? "Bảng chi tiết nhanh" : "Task Inspector"}
            </p>
            <h2 className="mt-0.5 text-[15px] font-semibold text-ink line-clamp-1">
              {task.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isVi ? "Đóng bảng chi tiết" : "Close inspector"}
            className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        <form action={formAction} className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
          <input type="hidden" name="id" value={task.id} />

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-muted">
                {isVi ? "Tiêu đề" : "Title"}
              </label>
              <Input name="title" defaultValue={task.title} required maxLength={160} />
            </div>

            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-muted">
                {isVi ? "Ghi chú / Mô tả" : "Notes / Description"}
              </label>
              <Textarea
                name="description"
                defaultValue={task.description ?? ""}
                rows={4}
                placeholder={isVi ? "Thêm chi tiết, bước thực hiện hoặc liên kết…" : "Add details, steps, or links…"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-muted">
                  {isVi ? "Loại nhiệm vụ" : "Kind"}
                </label>
                <Select name="kind" defaultValue={task.kind}>
                  <option value="must_do">{isVi ? "Bắt buộc" : "Must-do"}</option>
                  <option value="should_do">{isVi ? "Nên làm" : "Should-do"}</option>
                  <option value="optional">{isVi ? "Tùy chọn" : "Optional"}</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-muted">
                  {isVi ? "Danh mục" : "Category"}
                </label>
                <Select name="category" defaultValue={task.category}>
                  <option value="work">{isVi ? "Công việc" : "Work"}</option>
                  <option value="study">{isVi ? "Học tập" : "Study"}</option>
                  <option value="health">{isVi ? "Sức khỏe" : "Health"}</option>
                  <option value="personal">{isVi ? "Cá nhân" : "Personal"}</option>
                  <option value="finance">{isVi ? "Tài chính" : "Finance"}</option>
                  <option value="other">{isVi ? "Khác" : "Other"}</option>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11.5px] font-medium text-muted">
                  {isVi ? "Độ ưu tiên" : "Priority"}
                </label>
                <Select name="priority" defaultValue={task.priority}>
                  <option value="low">{isVi ? "Thấp" : "Low"}</option>
                  <option value="medium">{isVi ? "Trung bình" : "Medium"}</option>
                  <option value="high">{isVi ? "Cao" : "High"}</option>
                  <option value="urgent">{isVi ? "Khẩn cấp" : "Urgent"}</option>
                </Select>
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-muted">
                  <Calendar className="size-3" /> {isVi ? "Hạn chót" : "Due date"}
                </label>
                <Input type="date" name="dueDate" defaultValue={dueDateValue} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-muted">
                  <Clock className="size-3" /> {isVi ? "Ước tính (phút)" : "Estimate (min)"}
                </label>
                <Input
                  type="number"
                  name="estimatedMinutes"
                  min={5}
                  max={480}
                  defaultValue={task.estimatedMinutes}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-1 text-[11.5px] font-medium text-muted">
                  <Clock className="size-3" /> {isVi ? "Cần tập trung (phút)" : "Required focus (min)"}
                </label>
                <Input
                  type="number"
                  name="requiredFocusMinutes"
                  min={0}
                  max={480}
                  defaultValue={task.requiredFocusMinutes}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2/60 px-3.5 py-2.5 text-[12.5px]">
              <input
                type="checkbox"
                name="isDailyHabit"
                defaultChecked={Boolean(task.isDailyHabit)}
                className="size-4 accent-[var(--accent)]"
              />
              <Repeat className="size-3.5 text-accent" />
              <span>
                {isVi ? "Lặp lại mỗi ngày (Thói quen hằng ngày)" : "Repeat every day (Daily habit)"}
              </span>
            </label>

            <div className="rounded-xl border border-line bg-surface-2/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11.5px] font-semibold text-ink">
                  {isVi ? "Các bước nhỏ (Subtasks)" : "Subtasks checklist"}
                </span>
                {subtasks.length > 0 ? (
                  <span className="text-[11px] tabular-nums text-muted">
                    {subtasks.filter((s) => s.done).length}/{subtasks.length}
                  </span>
                ) : null}
              </div>
              <div className="space-y-1.5">
                {subtasks.map((sub) => (
                  <div key={sub.id} className="flex items-center gap-2 text-[12px]">
                    <button
                      type="button"
                      onClick={() =>
                        saveSubtasks(
                          subtasks.map((s) => (s.id === sub.id ? { ...s, done: !s.done } : s)),
                        )
                      }
                      className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                        sub.done
                          ? "border-success bg-success text-white"
                          : "border-line bg-surface"
                      }`}
                    >
                      {sub.done ? <Check className="size-2.5" strokeWidth={3} /> : null}
                    </button>
                    <span className={`flex-1 ${sub.done ? "text-muted line-through" : "text-ink"}`}>
                      {sub.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => saveSubtasks(subtasks.filter((s) => s.id !== sub.id))}
                      className="text-muted hover:text-danger"
                      aria-label="Remove subtask"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5">
                <Input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const clean = newSubtask.trim();
                      if (!clean) return;
                      saveSubtasks([...subtasks, { id: String(Date.now()), text: clean, done: false }]);
                      setNewSubtask("");
                    }
                  }}
                  placeholder={isVi ? "Thêm bước nhỏ…" : "Add a step…"}
                  className="h-8 text-[12px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const clean = newSubtask.trim();
                    if (!clean) return;
                    saveSubtasks([...subtasks, { id: String(Date.now()), text: clean, done: false }]);
                    setNewSubtask("");
                  }}
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-4">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={dupPending}
              onClick={() => {
                startDupTransition(async () => {
                  const fd = new FormData();
                  fd.set("title", `${task.title} (${isVi ? "bản sao" : "copy"})`);
                  fd.set("description", task.description ?? "");
                  fd.set("category", task.category);
                  fd.set("kind", task.kind);
                  fd.set("priority", task.priority);
                  fd.set("estimatedMinutes", String(task.estimatedMinutes));
                  fd.set("requiredFocusMinutes", String(task.requiredFocusMinutes));
                  fd.set("dueDate", dueDateValue);
                  if (task.isDailyHabit) fd.set("isDailyHabit", "on");
                  const res = await createTaskAction(EMPTY_ACTION_STATE, fd);
                  if (res.error) toast.push("error", res.error);
                  else {
                    toast.push("success", isVi ? "Đã nhân bản nhiệm vụ." : "Task duplicated.");
                    onClose();
                  }
                });
              }}
            >
              <Copy className="size-3.5" />
              {isVi ? "Nhân bản" : "Duplicate"}
            </Button>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                {isVi ? "Hủy" : "Cancel"}
              </Button>
              <Button type="submit" variant="accent" size="sm" disabled={pending}>
                <Save className="size-3.5" />
                {pending ? (isVi ? "Đang lưu…" : "Saving…") : isVi ? "Lưu thay đổi" : "Save changes"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
