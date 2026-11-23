"use client";

import { Globe, Save, Target } from "lucide-react";
import { useState, useTransition } from "react";
import { updateV2SettingsAction } from "@/lib/actions/v2";
import type { V2Settings } from "@/lib/data/v2-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SettingsForm({
  settings,
  displayName,
  timezone,
}: {
  settings: V2Settings;
  displayName: string;
  timezone: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const [language, setLanguage] = useState<"en" | "vi">(settings.language);
  const [dailyFocusGoalMinutes, setDailyFocusGoalMinutes] = useState(
    String(settings.dailyFocusGoalMinutes),
  );
  const [dailyStepsGoal, setDailyStepsGoal] = useState(String(settings.dailyStepsGoal));
  const [dailySleepGoalHours, setDailySleepGoalHours] = useState(
    String(settings.dailySleepGoalHours),
  );
  const [targetWeightKg, setTargetWeightKg] = useState(
    settings.targetWeightKg !== null ? String(settings.targetWeightKg) : "",
  );

  const isVi = language === "vi";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateV2SettingsAction({
        language,
        dailyFocusGoalMinutes: Number(dailyFocusGoalMinutes) || 120,
        dailyStepsGoal: Number(dailyStepsGoal) || 8000,
        dailySleepGoalHours: Number(dailySleepGoalHours) || 7.5,
        targetWeightKg: targetWeightKg.trim() ? Number(targetWeightKg) : null,
      });
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", isVi ? "Đã lưu cài đặt." : res.success);
    });
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="size-4 text-accent" />
            {isVi ? "Ngôn ngữ & Hồ sơ" : "Language & Profile"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-2">
          <div>
            <p className="text-[12px] text-muted">
              {isVi ? "Ngôn ngữ giao diện" : "Interface language"}
            </p>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                variant={language === "en" ? "accent" : "outline"}
                size="sm"
                onClick={() => setLanguage("en")}
              >
                English
              </Button>
              <Button
                type="button"
                variant={language === "vi" ? "accent" : "outline"}
                size="sm"
                onClick={() => setLanguage("vi")}
              >
                Tiếng Việt
              </Button>
            </div>
          </div>

          <dl className="space-y-2 border-t border-line pt-3 text-[12px]">
            <div className="flex items-center justify-between">
              <dt className="text-muted">{isVi ? "Tên hiển thị" : "Display name"}</dt>
              <dd className="font-medium text-ink">{displayName}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">{isVi ? "Múi giờ" : "Timezone"}</dt>
              <dd className="font-medium text-ink">{timezone}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="size-4 text-accent" />
            {isVi ? "Mục tiêu cá nhân hằng ngày" : "Personal Daily Goals"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px]">
              <span className="text-muted">
                {isVi ? "Mục tiêu Focus / ngày (phút)" : "Daily Focus Goal (min)"}
              </span>
              <Input
                type="number"
                min={15}
                value={dailyFocusGoalMinutes}
                onChange={(e) => setDailyFocusGoalMinutes(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-muted">
                {isVi ? "Mục tiêu bước chân / ngày" : "Daily Steps Goal"}
              </span>
              <Input
                type="number"
                min={1000}
                value={dailyStepsGoal}
                onChange={(e) => setDailyStepsGoal(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-muted">
                {isVi ? "Mục tiêu giấc ngủ (giờ)" : "Daily Sleep Goal (hours)"}
              </span>
              <Input
                type="number"
                min={4}
                max={14}
                step={0.5}
                value={dailySleepGoalHours}
                onChange={(e) => setDailySleepGoalHours(e.target.value)}
                className="mt-1"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-muted">
                {isVi ? "Cân nặng mục tiêu (kg)" : "Target Weight (kg)"}
              </span>
              <Input
                type="number"
                min={20}
                max={300}
                step={0.1}
                placeholder="65.0"
                value={targetWeightKg}
                onChange={(e) => setTargetWeightKg(e.target.value)}
                className="mt-1"
              />
            </label>
          </div>

          <Button type="submit" variant="accent" size="sm" disabled={pending}>
            <Save className="size-3.5" /> {isVi ? "Lưu cài đặt" : "Save settings"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
