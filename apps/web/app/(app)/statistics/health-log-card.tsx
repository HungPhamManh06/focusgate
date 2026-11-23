"use client";

import { Activity, Flame, Moon, Plus, Scale } from "lucide-react";
import { useState, useTransition } from "react";
import { saveManualHealthMetricAction } from "@/lib/actions/v2";
import { formatMinutes } from "@/lib/data/format";
import type { HealthSummary } from "@/lib/data/health";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { BarChart } from "@/components/charts/bar-chart";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type HealthPeriodTab = "week" | "month" | "year";
type HealthChartMetric = "steps" | "sleep" | "calories" | "weight";

function formatPctDelta(current: number, previous: number | undefined, isVi: boolean): string {
  if (previous === undefined || previous <= 0) return isVi ? "Chưa có kỳ trước" : "No prior period";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return isVi ? "0% so với kỳ trước" : "0% vs prior";
  return `${pct > 0 ? "+" : ""}${pct}% ${isVi ? "so với kỳ trước" : "vs prior"}`;
}

function formatSleepDelta(currentMin: number, previousMin: number | undefined, isVi: boolean): string {
  if (previousMin === undefined || previousMin <= 0) return isVi ? "Chưa có kỳ trước" : "No prior period";
  const diff = currentMin - previousMin;
  if (diff === 0) return isVi ? "Bằng kỳ trước" : "Same as prior";
  const sign = diff > 0 ? "+" : "-";
  return `${sign}${formatMinutes(Math.abs(diff))} ${isVi ? "so với kỳ trước" : "vs prior"}`;
}

function formatWeightDelta(currentKg: number | null, previousKg: number | null | undefined, isVi: boolean): string {
  if (currentKg === null || previousKg === null || previousKg === undefined) {
    return isVi ? "Chưa có kỳ trước" : "No prior period";
  }
  const diff = Math.round((currentKg - previousKg) * 10) / 10;
  if (diff === 0) return isVi ? "0 kg so với kỳ trước" : "0 kg vs prior";
  return `${diff > 0 ? "+" : ""}${diff} kg ${isVi ? "so với kỳ trước" : "vs prior"}`;
}

export function HealthLogCard({
  health,
  todayDate,
  focusDays = [],
}: {
  health: HealthSummary;
  todayDate: string;
  focusDays?: ReadonlyArray<{ date: string; focusMinutes: number }>;
}) {
  const isVi = useLocale() === "vi";
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const [tab, setTab] = useState<HealthPeriodTab>("week");
  const [chartMetric, setChartMetric] = useState<HealthChartMetric>("steps");

  const existingToday = health.days.find((d) => d.date === todayDate) ?? health.latest;
  const [date, setDate] = useState(todayDate);
  const [steps, setSteps] = useState(existingToday ? String(existingToday.steps) : "");
  const [calories, setCalories] = useState(
    existingToday ? String(existingToday.activeCalories) : "",
  );
  const [sleepHours, setSleepHours] = useState(
    existingToday && existingToday.sleepMinutes > 0
      ? String(Math.round((existingToday.sleepMinutes / 60) * 10) / 10)
      : "",
  );
  const [weightKg, setWeightKg] = useState(
    existingToday?.weightKg ? String(existingToday.weightKg) : "",
  );

  const loadDayIntoForm = (dayDate: string) => {
    const found = health.days.find((d) => d.date === dayDate);
    setDate(dayDate);
    setSteps(found ? String(found.steps) : "");
    setCalories(found ? String(found.activeCalories) : "");
    setSleepHours(
      found && found.sleepMinutes > 0
        ? String(Math.round((found.sleepMinutes / 60) * 10) / 10)
        : "",
    );
    setWeightKg(found?.weightKg ? String(found.weightKg) : "");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await saveManualHealthMetricAction({
        date,
        steps: Number(steps) || 0,
        activeCalories: Number(calories) || 0,
        sleepHours: Number(sleepHours) || 0,
        weightKg: weightKg.trim() ? Number(weightKg) : null,
      });
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  const activeComparison =
    tab === "week" ? health.byWeek : tab === "month" ? health.byMonth : health.byYear;
  const cur = activeComparison.current;
  const prev = activeComparison.previous;

  const focusByDate = new Map(focusDays.map((d) => [d.date, d.focusMinutes]));
  const pairedDays = health.days.filter((d) => focusByDate.has(d.date));
  const wellSlept = pairedDays.filter((d) => d.sleepMinutes >= 420);
  const shortSlept = pairedDays.filter((d) => d.sleepMinutes > 0 && d.sleepMinutes < 420);
  const avgFocusWellSlept =
    wellSlept.length > 0
      ? Math.round(wellSlept.reduce((s, d) => s + (focusByDate.get(d.date) ?? 0), 0) / wellSlept.length)
      : null;
  const avgFocusShortSlept =
    shortSlept.length > 0
      ? Math.round(shortSlept.reduce((s, d) => s + (focusByDate.get(d.date) ?? 0), 0) / shortSlept.length)
      : null;

  const chartPoints =
    tab === "week"
      ? [...health.days]
          .slice(0, 7)
          .reverse()
          .map((d) => ({
            label: d.date.slice(5),
            value:
              chartMetric === "steps"
                ? d.steps
                : chartMetric === "sleep"
                  ? d.sleepMinutes
                  : chartMetric === "calories"
                    ? d.activeCalories
                    : Math.round((d.weightKg ?? 0) * 10),
          }))
      : [...activeComparison.buckets]
          .slice(0, 12)
          .reverse()
          .map((b) => ({
            label: b.label,
            value:
              chartMetric === "steps"
                ? b.avgSteps
                : chartMetric === "sleep"
                  ? b.avgSleepMinutes
                  : chartMetric === "calories"
                    ? b.avgCalories
                    : Math.round((b.avgWeightKg ?? 0) * 10),
          }));

  return (
    <Card>
      <CardHeader className="flex-wrap gap-3">
        <div>
          <CardTitle>{isVi ? "Sức khỏe & Thể trạng" : "Health & Readiness"}</CardTitle>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Nhập bước chân, calo, số giờ ngủ và cân nặng hằng ngày rồi so sánh theo tuần, tháng, năm."
              : "Log daily steps, calories, sleep hours, and weight, then compare by week, month, and year."}
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-full border border-line bg-surface-2/60 p-1">
          {(
            [
              { id: "week", label: isVi ? "Tuần" : "Week" },
              { id: "month", label: isVi ? "Tháng" : "Month" },
              { id: "year", label: isVi ? "Năm" : "Year" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "rounded-full px-3 py-1 text-[11.5px] font-medium transition-colors",
                tab === item.id
                  ? "bg-ink text-canvas"
                  : "text-muted hover:text-ink",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Activity className="size-3.5 text-accent" /> {isVi ? "TB Bước chân" : "Avg Steps"} ({cur.label})
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {cur.daysLogged > 0 ? cur.avgSteps.toLocaleString() : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {formatPctDelta(cur.avgSteps, prev?.avgSteps, isVi)}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Flame className="size-3.5 text-warning" /> {isVi ? "TB Calo" : "Avg Calories"} ({cur.label})
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {cur.daysLogged > 0 ? `${cur.avgCalories} kcal` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {formatPctDelta(cur.avgCalories, prev?.avgCalories, isVi)}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Moon className="size-3.5 text-accent" /> {isVi ? "TB Giấc ngủ" : "Avg Sleep"} ({cur.label})
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {cur.avgSleepMinutes > 0 ? formatMinutes(cur.avgSleepMinutes) : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {formatSleepDelta(cur.avgSleepMinutes, prev?.avgSleepMinutes, isVi)}
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Scale className="size-3.5 text-success" /> {isVi ? "TB Cân nặng" : "Avg Weight"} ({cur.label})
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {cur.avgWeightKg !== null ? `${cur.avgWeightKg} kg` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              {formatWeightDelta(cur.avgWeightKg, prev?.avgWeightKg, isVi)}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-2.5 rounded-xl border border-line bg-surface-2/40 p-3 sm:grid-cols-6 sm:items-end"
        >
          <label className="block text-[11px]">
            <span className="text-muted">{isVi ? "Ngày" : "Date"}</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => loadDayIntoForm(e.target.value)}
              className="mt-1"
              required
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted">{isVi ? "Bước chân" : "Steps"}</span>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 7500"
              value={steps}
              onChange={(e) => setSteps(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted">{isVi ? "Calo (kcal)" : "Calories (kcal)"}</span>
            <Input
              type="number"
              min={0}
              placeholder="e.g. 320"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted">{isVi ? "Giấc ngủ (giờ)" : "Sleep (hours)"}</span>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.1}
              placeholder="e.g. 7.5"
              value={sleepHours}
              onChange={(e) => setSleepHours(e.target.value)}
              className="mt-1"
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted">{isVi ? "Cân nặng (kg)" : "Weight (kg)"}</span>
            <Input
              type="number"
              min={20}
              max={300}
              step={0.1}
              placeholder="e.g. 65.2"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              className="mt-1"
            />
          </label>
          <Button type="submit" variant="accent" size="sm" disabled={pending} className="h-9">
            <Plus className="size-3.5" /> {isVi ? "Lưu ngày" : "Save day"}
          </Button>
        </form>

        {chartPoints.length > 0 ? (
          <div className="rounded-xl border border-line bg-surface-2/30 p-3.5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11.5px] font-medium text-ink">
                {isVi ? "Xu hướng sức khỏe" : "Health trend"} (
                {isVi ? (tab === "week" ? "tuần" : tab === "month" ? "tháng" : "năm") : tab})
              </p>
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    { id: "steps", label: isVi ? "Bước chân" : "Steps" },
                    { id: "calories", label: isVi ? "Calo" : "Calories" },
                    { id: "sleep", label: isVi ? "Giấc ngủ" : "Sleep" },
                    { id: "weight", label: isVi ? "Cân nặng (×0.1kg)" : "Weight (×0.1kg)" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setChartMetric(m.id)}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[10.5px] font-medium transition-colors",
                      chartMetric === m.id
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-surface text-muted hover:text-ink",
                    )}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <BarChart
              data={chartPoints}
              tone={chartMetric === "weight" || chartMetric === "calories" ? "ink" : "accent"}
              unit={
                chartMetric === "steps"
                  ? "steps"
                  : chartMetric === "calories"
                    ? "kcal"
                    : chartMetric === "weight"
                      ? "kg10"
                      : "minutes"
              }
              height={130}
              emptyLabel={isVi ? "Nhập chỉ số sức khỏe để xem xu hướng." : "Log health entries to see trends."}
            />
            {avgFocusWellSlept !== null || avgFocusShortSlept !== null ? (
              <p className="mt-2.5 text-[11px] text-muted">
                {isVi ? "Tương quan Tập trung & Giấc ngủ:" : "Focus vs Sleep correlation:"}{" "}
                {avgFocusWellSlept !== null
                  ? isVi
                    ? `ngủ ≥7h tập trung TB ${formatMinutes(avgFocusWellSlept)}/ngày`
                    : `≥7h sleep averages ${formatMinutes(avgFocusWellSlept)} focus/day`
                  : ""}
                {avgFocusWellSlept !== null && avgFocusShortSlept !== null ? " · " : ""}
                {avgFocusShortSlept !== null
                  ? isVi
                    ? `ngủ <7h tập trung TB ${formatMinutes(avgFocusShortSlept)}/ngày`
                    : `<7h sleep averages ${formatMinutes(avgFocusShortSlept)} focus/day`
                  : ""}
                .
              </p>
            ) : null}
          </div>
        ) : null}

        {activeComparison.buckets.length > 0 ? (
          <div className="overflow-x-auto">
            <p className="mb-1.5 text-[11px] font-medium text-muted">
              {isVi ? "So sánh theo kỳ" : "Period comparison"} (
              {isVi ? (tab === "week" ? "tuần" : tab === "month" ? "tháng" : "năm") : tab})
            </p>
            <table className="w-full min-w-[520px] text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-3 font-medium">{isVi ? "Kỳ" : "Period"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "Số ngày" : "Days"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "TB Bước" : "Avg Steps"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "TB Calo" : "Avg Calories"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "TB Ngủ" : "Avg Sleep"}</th>
                  <th className="py-2 text-right font-medium">{isVi ? "TB Cân nặng" : "Avg Weight"}</th>
                </tr>
              </thead>
              <tbody>
                {activeComparison.buckets.slice(0, 12).map((b) => (
                  <tr key={b.key} className="border-b border-line/70 last:border-0">
                    <td className="py-2 pr-3 font-medium text-ink">{b.label}</td>
                    <td className="py-2 pr-3 text-right text-muted">{b.daysLogged}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.avgSteps > 0 ? b.avgSteps.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.avgCalories > 0 ? `${b.avgCalories} kcal` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {b.avgSleepMinutes > 0 ? formatMinutes(b.avgSleepMinutes) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {b.avgWeightKg !== null ? `${b.avgWeightKg} kg` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {health.days.length > 0 ? (
          <div className="overflow-x-auto">
            <p className="mb-1.5 text-[11px] font-medium text-muted">
              {isVi ? "Nhật ký từng ngày (bấm vào dòng để sửa)" : "Daily entries (click a row to edit)"}
            </p>
            <table className="w-full min-w-[480px] text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-3 font-medium">{isVi ? "Ngày" : "Date"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "Bước chân" : "Steps"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "Calo" : "Calories"}</th>
                  <th className="py-2 pr-3 text-right font-medium">{isVi ? "Giấc ngủ" : "Sleep"}</th>
                  <th className="py-2 text-right font-medium">{isVi ? "Cân nặng" : "Weight"}</th>
                </tr>
              </thead>
              <tbody>
                {health.days.slice(0, 14).map((d) => (
                  <tr
                    key={d.date}
                    onClick={() => loadDayIntoForm(d.date)}
                    className="cursor-pointer border-b border-line/70 last:border-0 hover:bg-surface-2/50"
                  >
                    <td className="py-2 pr-3 font-medium text-ink-soft">{d.date}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {d.steps > 0 ? d.steps.toLocaleString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {d.activeCalories > 0 ? `${d.activeCalories} kcal` : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {d.sleepMinutes > 0 ? formatMinutes(d.sleepMinutes) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {d.weightKg !== null ? `${d.weightKg} kg` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
