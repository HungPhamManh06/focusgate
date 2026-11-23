"use client";

import { Flame, Shield, Snowflake, Timer, Unlock } from "lucide-react";
import { useTransition } from "react";
import { activateUnlockPassAction, buyStreakFreezeAction } from "@/lib/actions/v2";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function EarnedTimeCard({
  earnedMinutesBalance,
  streakFreezeCount,
  unlockPassUntil,
}: {
  earnedMinutesBalance: number;
  streakFreezeCount: number;
  unlockPassUntil: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const passActive =
    Boolean(unlockPassUntil) && new Date(unlockPassUntil!).getTime() > Date.now();

  const runUnlock = (minutes: number) => {
    startTransition(async () => {
      const res = await activateUnlockPassAction(minutes);
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  const runBuyFreeze = () => {
    startTransition(async () => {
      const res = await buyStreakFreezeAction();
      if (res.error) toast.push("error", res.error);
      else if (res.success) toast.push("success", res.success);
    });
  };

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Timer className="size-4 text-accent" />
            Earned Time &amp; Streak Protection
          </CardTitle>
          <p className="mt-0.5 text-[12px] text-muted">
            Every completed task adds +5m Earned Time. Spend it on temporary Unlock Passes or Streak Freezes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="accent">{earnedMinutesBalance}m Earned</Badge>
          <Badge tone="neutral">
            <Snowflake className="mr-1 size-3" />
            {streakFreezeCount} Freeze{streakFreezeCount === 1 ? "" : "s"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-[12px] text-muted">
          {passActive ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <Unlock className="size-3.5" />
              Unlock Pass active until{" "}
              {new Date(unlockPassUntil!).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Shield className="size-3.5" />
              No active Unlock Pass right now.
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || earnedMinutesBalance < 10}
            onClick={() => runUnlock(10)}
          >
            <Unlock className="size-3.5" /> Unlock 10m Pass
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || earnedMinutesBalance < 20}
            onClick={() => runUnlock(20)}
          >
            <Flame className="size-3.5" /> Unlock 20m Pass
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={pending || earnedMinutesBalance < 30}
            onClick={runBuyFreeze}
          >
            <Snowflake className="size-3.5" /> Buy Streak Freeze (30m)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
