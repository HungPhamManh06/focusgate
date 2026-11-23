"use client";

import { Loader2, Pencil, Plus, X } from "lucide-react";
import { useActionState, useCallback, useEffect, useState } from "react";
import { createTaskAction, updateTaskAction } from "@/lib/actions/tasks";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
import type { Task } from "@/lib/data/types";
import { isoToDateInput } from "@/lib/validation";
import { useLocale } from "@/components/i18n/language-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { useDialogAccessibility } from "@/components/ui/confirm-dialog";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function TaskFormDialog({
  task,
  trigger = "create",
  className,
}: {
  task?: Task;
  trigger?: "create" | "edit";
  className?: string;
}) {
  const isVi = useLocale() === "vi";
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    task ? updateTaskAction : createTaskAction,
    EMPTY_ACTION_STATE,
  );
  const toast = useToast();
  const handleClose = useCallback(() => setOpen(false), []);
  const dialogRef = useDialogAccessibility(open, handleClose);

  useEffect(() => {
    if (!state.success) return;
    toast.push("success", state.success);
    setOpen(false);
  }, [state.success, toast]);

  const isEdit = trigger === "edit";

  return (
    <>
      {isEdit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Edit ${task?.title ?? "task"}`}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink",
            className,
          )}
        >
          <Pencil className="size-3.5" />
        </button>
      ) : (
        <Button variant="accent" onClick={() => setOpen(true)} className={className}>
          <Plus className="size-4" /> {isVi ? "Nhiệm vụ mới" : "New task"}
        </Button>
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-dialog-title"
            className="max-h-[92vh] w-full max-w-[560px] overflow-y-auto rounded-t-[22px] border border-line bg-surface shadow-lift sm:rounded-[22px]"
          >
            <div className="flex items-start justify-between border-b border-line px-6 py-5">
              <div>
                <p className="label-xs text-muted">
                  {isEdit ? (isVi ? "Sửa nhiệm vụ" : "Edit task") : (isVi ? "Nhiệm vụ mới" : "New task")}
                </p>
                <h2 id="task-dialog-title" className="mt-2 font-display text-[26px] leading-none">
                  {isEdit
                    ? isVi ? "Chỉnh sửa công việc." : "Refine the work."
                    : isVi ? "Cần làm việc gì?" : "What needs doing?"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                aria-label="Close dialog"
                className="flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            <form action={formAction} className="space-y-4 px-6 py-5">
              {task ? <input type="hidden" name="id" value={task.id} /> : null}

              {state.error ? (
                <p className="rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-[12px] text-danger">
                  {state.error}
                </p>
              ) : null}

              <div>
                <Label htmlFor="title">{isVi ? "Tiêu đề" : "Title"}</Label>
                <Input
                  id="title"
                  name="title"
                  defaultValue={task?.title ?? ""}
                  placeholder={isVi ? "VD: Hoàn thành bài tập nhóm" : "e.g. Finish the onboarding copy"}
                  maxLength={160}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="kind">{isVi ? "Loại cổng" : "Gate type"}</Label>
                  <Select id="kind" name="kind" defaultValue={task?.kind ?? "should_do"}>
                    <option value="must_do">{isVi ? "Bắt buộc" : "Must-do"}</option>
                    <option value="should_do">{isVi ? "Nên làm" : "Should-do"}</option>
                    <option value="bonus">{isVi ? "Thưởng thêm" : "Bonus"}</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">{isVi ? "Độ ưu tiên" : "Priority"}</Label>
                  <Select id="priority" name="priority" defaultValue={task?.priority ?? "medium"}>
                    <option value="low">{isVi ? "Thấp" : "Low"}</option>
                    <option value="medium">{isVi ? "Trung bình" : "Medium"}</option>
                    <option value="high">{isVi ? "Cao" : "High"}</option>
                    <option value="urgent">{isVi ? "Khẩn cấp" : "Urgent"}</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="estimatedMinutes">{isVi ? "Ước tính (phút)" : "Estimate (min)"}</Label>
                  <Input
                    id="estimatedMinutes"
                    name="estimatedMinutes"
                    type="number"
                    min={5}
                    max={480}
                    step={5}
                    defaultValue={task?.estimatedMinutes ?? 30}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="requiredFocusMinutes">
                    {isVi ? "Tập trung yêu cầu (phút)" : "Focus required (min)"}
                  </Label>
                  <Input
                    id="requiredFocusMinutes"
                    name="requiredFocusMinutes"
                    type="number"
                    min={0}
                    max={480}
                    step={5}
                    defaultValue={task?.requiredFocusMinutes ?? 0}
                    required
                  />
                </div>
              </div>

              <p className="text-[11px] leading-relaxed text-muted">
                {isVi
                  ? "Mặc định là 0 để bạn có thể tích hoàn thành mà không cần bấm giờ. Đặt > 0 chỉ khi nhiệm vụ cần đủ phút tập trung."
                  : "Default is 0 so you can check off tasks without a timer. Set > 0 only if a task must be backed by focused minutes."}
              </p>

              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5 text-[12.5px] font-medium text-ink">
                <input
                  type="checkbox"
                  name="isDailyHabit"
                  defaultChecked={Boolean(task?.isDailyHabit)}
                  className="size-4 accent-accent"
                />
                <span>
                  {isVi
                    ? "Thói quen hằng ngày (lặp lại trong kế hoạch hôm nay)"
                    : "Daily habit (repeat in today's plan)"}
                </span>
              </label>

              <details
                className="rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5"
                open={Boolean(task?.description || task?.dueDate || (task && task.category !== "work"))}
              >
                <summary className="cursor-pointer select-none text-[12px] font-medium text-ink">
                  {isVi
                    ? "Chi tiết thêm (ghi chú, danh mục, hạn chót)"
                    : "More details (notes, category, due date)"}
                </summary>
                <div className="mt-3 space-y-3 border-t border-line pt-3">
                  <div>
                    <Label htmlFor="description">{isVi ? "Ghi chú" : "Notes"}</Label>
                    <Textarea
                      id="description"
                      name="description"
                      defaultValue={task?.description ?? ""}
                      placeholder={
                        isVi
                          ? "Ngữ cảnh, liên kết hoặc tiêu chí hoàn thành."
                          : "Optional context, links, or the definition of done."
                      }
                      maxLength={2000}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="category">{isVi ? "Danh mục" : "Category"}</Label>
                      <Select id="category" name="category" defaultValue={task?.category ?? "work"}>
                        <option value="work">{isVi ? "Công việc" : "Work"}</option>
                        <option value="study">{isVi ? "Học tập" : "Study"}</option>
                        <option value="health">{isVi ? "Sức khỏe" : "Health"}</option>
                        <option value="personal">{isVi ? "Cá nhân" : "Personal"}</option>
                        <option value="finance">{isVi ? "Tài chính" : "Finance"}</option>
                        <option value="other">{isVi ? "Khác" : "Other"}</option>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="dueDate">{isVi ? "Hạn chót" : "Due date"}</Label>
                      <Input
                        id="dueDate"
                        name="dueDate"
                        type="date"
                        defaultValue={isoToDateInput(task?.dueDate ?? null)}
                      />
                    </div>
                  </div>
                </div>
              </details>

              <div className="flex items-center justify-end gap-2 border-t border-line pt-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className={buttonVariants({ variant: "ghost", size: "md" })}
                >
                  {isVi ? "Hủy" : "Cancel"}
                </button>
                <Button type="submit" variant="accent" disabled={pending}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {isEdit
                    ? isVi ? "Lưu thay đổi" : "Save changes"
                    : isVi ? "Tạo nhiệm vụ" : "Create task"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
