"use client";

import { Layers, Plus, Repeat, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  applyPlanTemplateAction,
  createRecurringRuleAction,
  deleteRecurringRuleAction,
  spawnTodayRecurringTasksAction,
} from "@/lib/actions/v4";
import type { PlanTemplateRecord, RecurringRuleRecord } from "@/lib/data/v4-ecosystem";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function TemplatesRoutinesCard({
  templates,
  recurringRules,
}: {
  templates: PlanTemplateRecord[];
  recurringRules: RecurringRuleRecord[];
}) {
  const locale = useLocale();
  const isVi = locale === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const [ruleTitle, setRuleTitle] = useState("");
  const [recurrenceType, setRecurrenceType] = useState<"daily" | "weekdays">("daily");
  const [estimatedMinutes, setEstimatedMinutes] = useState("30");

  const handleApplyTemplate = (templateId: string) => {
    startTransition(async () => {
      const res = await applyPlanTemplateAction(templateId, locale);
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  const handleCreateRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleTitle.trim()) return;
    startTransition(async () => {
      const res = await createRecurringRuleAction({
        title: ruleTitle,
        category: "work",
        kind: "must_do",
        estimatedMinutes: Number(estimatedMinutes) || 30,
        recurrenceType,
        daysOfWeek: recurrenceType === "weekdays" ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6, 7],
      });
      if (res.error) toast.push("error", res.error);
      else {
        toast.push("success", isVi ? "Đã lưu nhiệm vụ lặp lại." : "Recurring rule saved.");
        setRuleTitle("");
      }
    });
  };

  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {/* Plan Templates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="size-4 text-accent" />
            {isVi ? "Bộ mẫu kế hoạch (1 chạm)" : "1-Click Plan Templates"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-2">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2/40 px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-semibold text-ink">{tpl.name}</p>
                <p className="truncate text-[11.5px] text-muted">{tpl.description}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => handleApplyTemplate(tpl.id)}
              >
                <Sparkles className="size-3" /> {isVi ? "Nạp ngay" : "Apply"}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Smart Recurring Tasks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Repeat className="size-4 text-accent" />
            {isVi ? "Nhiệm vụ lặp lại thông minh" : "Smart Recurring Tasks"}
          </CardTitle>
          {recurringRules.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="accent"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await spawnTodayRecurringTasksAction();
                  if (res.error) toast.push("error", res.error);
                  else if (res.success) toast.push("success", res.success);
                })
              }
            >
              {isVi ? "Tạo cho hôm nay" : "Add due today"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <form onSubmit={handleCreateRule} className="grid gap-2 sm:grid-cols-[1fr_110px_68px_auto]">
            <Input
              value={ruleTitle}
              onChange={(e) => setRuleTitle(e.target.value)}
              placeholder={isVi ? "VD: Ôn 30 từ vựng tiếng Anh" : "e.g. Review 30 flashcards"}
              disabled={pending}
            />
            <select
              value={recurrenceType}
              onChange={(e) =>
                setRecurrenceType(e.target.value === "weekdays" ? "weekdays" : "daily")
              }
              className="h-9 rounded-xl border border-line bg-surface px-2.5 text-[12px] text-ink"
            >
              <option value="daily">{isVi ? "Hằng ngày" : "Daily"}</option>
              <option value="weekdays">{isVi ? "Thứ 2–Thứ 6" : "Weekdays"}</option>
            </select>
            <Input
              type="number"
              min={5}
              max={180}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              title={isVi ? "Số phút" : "Minutes"}
            />
            <Button type="submit" size="sm" variant="outline" disabled={pending || !ruleTitle.trim()}>
              <Plus className="size-3.5" />
            </Button>
          </form>

          {recurringRules.length === 0 ? (
            <p className="text-[12px] text-muted">
              {isVi
                ? "Chưa có nhiệm vụ lặp lại nào. Thêm việc cố định mỗi ngày để không phải gõ lại."
                : "No recurring tasks yet. Add daily or weekday routines to auto-populate your plan."}
            </p>
          ) : (
            <div className="space-y-1.5">
              {recurringRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface-2/30 px-3 py-2 text-[12px]"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium text-ink">{rule.title}</span>
                    <Badge tone="neutral">
                      {rule.recurrenceType === "daily"
                        ? isVi
                          ? "Hằng ngày"
                          : "Daily"
                        : isVi
                          ? "T2–T6"
                          : "Weekdays"}
                    </Badge>
                    <span className="text-[11px] text-muted">{rule.estimatedMinutes}m</span>
                  </div>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await deleteRecurringRuleAction(rule.id);
                        if (res.error) toast.push("error", res.error);
                      })
                    }
                    className="rounded p-1 text-muted hover:text-danger"
                    aria-label="Delete rule"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
