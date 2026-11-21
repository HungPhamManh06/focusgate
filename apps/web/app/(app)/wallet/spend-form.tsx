"use client";

import { Loader2, MinusCircle } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { spendMinutesAction } from "@/lib/actions/rewards";
import { EMPTY_ACTION_STATE } from "@/lib/actions/types";
import { formatDate, formatMinutes } from "@/lib/data/format";
import type { Grant } from "@/lib/data/types";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function SpendForm({ grants, timezone }: { grants: Grant[]; timezone: string }) {
  const [state, formAction, pending] = useActionState(spendMinutesAction, EMPTY_ACTION_STATE);
  const [grantId, setGrantId] = useState(grants[0]?.id ?? "");
  const [minutes, setMinutes] = useState(15);
  const [label, setLabel] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (state.success) {
      toast.push("success", state.success);
      setLabel("");
      setMinutes(15);
    } else if (state.error) {
      toast.push("error", state.error);
    }
  }, [state, toast]);

  useEffect(() => {
    if (!grants.some((grant) => grant.id === grantId)) setGrantId(grants[0]?.id ?? "");
  }, [grants, grantId]);

  if (grants.length === 0) {
    return (
      <p className="text-[12px] leading-relaxed text-muted">
        No active grant to spend. Finish a plan to earn your next block of time.
      </p>
    );
  }

  const selected = grants.find((grant) => grant.id === grantId);
  const maxMinutes = Math.max(1, selected?.remainingMinutes ?? 1);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="spend-grant">From grant</Label>
        <Select id="spend-grant" name="grantId" value={grantId} onChange={(event) => setGrantId(event.target.value)}>
          {grants.map((grant) => (
            <option key={grant.id} value={grant.id}>
              {formatMinutes(grant.remainingMinutes)} left · expires{" "}
              {formatDate(grant.expiresAt, { month: "short", day: "numeric" }, timezone)}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
        <div>
          <Label htmlFor="spend-minutes">Minutes</Label>
          <Input
            id="spend-minutes"
            name="minutes"
            type="number"
            min={1}
            max={maxMinutes}
            value={minutes}
            onChange={(event) => setMinutes(Number(event.target.value))}
            required
          />
        </div>
        <div>
          <Label htmlFor="spend-label">What for?</Label>
          <Input
            id="spend-label"
            name="label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="YouTube, gaming, social…"
            maxLength={120}
            required
          />
        </div>
      </div>

      <p className="text-[10.5px] leading-relaxed text-muted">
        Max {formatMinutes(maxMinutes)} on this grant. Spending records a usage event and is final.
      </p>

      <Button type="submit" variant="primary" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <MinusCircle className="size-4" />}
        Spend {Math.max(1, Math.min(minutes || 0, maxMinutes))} min
      </Button>
    </form>
  );
}
