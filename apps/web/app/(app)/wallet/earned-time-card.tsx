"use client";

import { Flame, Shield, Snowflake, Timer, Unlock } from "lucide-react";
import { useTransition } from "react";
import { activateUnlockPassAction, buyStreakFreezeAction } from "@/lib/actions/v2";
import { useLocale } from "@/components/i18n/language-provider";
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
  const isVi = useLocale() === "vi";
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
            {isVi ? "Thời gian tích lũy & Bảo vệ chuỗi" : "Earned Time & Streak Protection"}
          </CardTitle>
          <p className="mt-0.5 text-[12px] text-muted">
            {isVi
              ? "Mỗi nhiệm vụ hoàn thành cộng +5m Tích lũy. Dùng để mở khóa tạm thời hoặc mua Đóng băng chuỗi."
              : "Every completed task adds +5m Earned Time. Spend it on temporary Unlock Passes or Streak Freezes."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="accent">
            {earnedMinutesBalance}m {isVi ? "Tích lũy" : "Earned"}
          </Badge>
          <Badge tone="neutral">
            <Snowflake className="mr-1 size-3" />
            {isVi
              ? `${streakFreezeCount} Đóng băng`
              : `${streakFreezeCount} Freeze${streakFreezeCount === 1 ? "" : "s"}`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="text-[12px] text-muted">
          {passActive ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-success">
              <Unlock className="size-3.5" />
              {isVi ? "Thẻ mở khóa hiệu lực đến " : "Unlock Pass active until "}
              {new Date(unlockPassUntil!).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Shield className="size-3.5" />
              {isVi ? "Hiện không có Thẻ mở khóa nào." : "No active Unlock Pass right now."}
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
            <Unlock className="size-3.5" /> {isVi ? "Mở khóa 10m" : "Unlock 10m Pass"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending || earnedMinutesBalance < 20}
            onClick={() => runUnlock(20)}
          >
            <Flame className="size-3.5" /> {isVi ? "Mở khóa 20m" : "Unlock 20m Pass"}
          </Button>
          <Button
            type="button"
            variant="accent"
            size="sm"
            disabled={pending || earnedMinutesBalance < 30}
            onClick={runBuyFreeze}
          >
            <Snowflake className="size-3.5" /> {isVi ? "Mua Đóng băng chuỗi (30m)" : "Buy Streak Freeze (30m)"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
