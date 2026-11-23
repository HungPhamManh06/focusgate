"use client";

import { Activity, Flame, Moon, Plus, Scale } from "lucide-react";
import { useState, useTransition } from "react";
import { saveManualHealthMetricAction } from "@/lib/actions/v2";
import { formatMinutes } from "@/lib/data/format";
import type { HealthSummary } from "@/lib/data/health";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function HealthLogCard({
  health,
  todayDate,
}: {
  health: HealthSummary;
  todayDate: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const existingToday = health.days.find((d) => d.date === todayDate) ?? health.latest;
  const [date, setDate] = useState(todayDate);
  const [steps, setSteps] = useState(existingToday ? String(existingToday.steps) : "");
  const [calories, setCalories] = useState(existingToday ? String(existingToday.activeCalories) : "");
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

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Health &amp; Readiness (Mi Band 10 · Manual &amp; Health Connect)</CardTitle>
          <p className="mt-1 text-[12px] text-muted">
            Log daily steps, calories, sleep hours, and weight — or sync automatically via Health Connect.
          </p>
        </div>
        <span className="text-[11px] text-muted">
          {health.days.length} day{health.days.length === 1 ? "" : "s"} logged
        </span>
      </CardHeader>

      <CardContent className="space-y-4 pt-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Activity className="size-3.5 text-accent" /> Steps (Latest)
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {health.latest ? health.latest.steps.toLocaleString() : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Avg {health.avgSteps.toLocaleString()}/day
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Flame className="size-3.5 text-warning" /> Calories (Latest)
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {health.latest ? `${health.latest.activeCalories} kcal` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Avg {health.avgCalories} kcal/day
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Moon className="size-3.5 text-accent" /> Sleep (Latest)
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {health.latest && health.latest.sleepMinutes > 0
                ? formatMinutes(health.latest.sleepMinutes)
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Avg {formatMinutes(health.avgSleepMinutes)}/night
            </p>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/50 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <Scale className="size-3.5 text-success" /> Weight (Latest)
            </p>
            <p className="mt-1 font-display text-[22px] leading-none">
              {health.latestWeightKg !== null ? `${health.latestWeightKg} kg` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-muted">Body weight tracking</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid gap-2.5 rounded-xl border border-line bg-surface-2/40 p-3 sm:grid-cols-6 sm:items-end"
        >
          <label className="block text-[11px]">
            <span className="text-muted">Date</span>
            <Input
              type="date"
              value={date}
              onChange={(e) => loadDayIntoForm(e.target.value)}
              className="mt-1"
              required
            />
          </label>
          <label className="block text-[11px]">
            <span className="text-muted">Steps</span>
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
            <span className="text-muted">Calories (kcal)</span>
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
            <span className="text-muted">Sleep (hours)</span>
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
            <span className="text-muted">Weight (kg)</span>
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
            <Plus className="size-3.5" /> Save day
          </Button>
        </form>

        {health.days.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-[11.5px]">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 text-right font-medium">Steps</th>
                  <th className="py-2 pr-3 text-right font-medium">Calories</th>
                  <th className="py-2 pr-3 text-right font-medium">Sleep</th>
                  <th className="py-2 text-right font-medium">Weight</th>
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
