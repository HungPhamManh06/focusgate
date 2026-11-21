"use client";

import { Loader2 } from "lucide-react";
import { useTransition } from "react";
import type { ActionState } from "@/lib/actions/types";
import { Button, type ButtonProps } from "./button";
import { useToast } from "./toast";

type Props = Omit<ButtonProps, "onClick"> & {
  action: () => Promise<ActionState>;
  confirmMessage?: string;
  pendingLabel?: string;
};

export function ActionButton({
  action,
  confirmMessage,
  pendingLabel,
  children,
  disabled,
  ...props
}: Props) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) toast.push("error", result.error);
        else if (result.success) toast.push("success", result.success);
      } catch {
        toast.push("error", "The action could not be completed.");
      }
    });
  }

  return (
    <Button onClick={run} disabled={disabled || pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </Button>
  );
}
