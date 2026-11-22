"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import type { ActionState } from "@/lib/actions/types";
import { Button, type ButtonProps } from "./button";
import { ConfirmDialog } from "./confirm-dialog";
import { useToast } from "./toast";

type Props = Omit<ButtonProps, "onClick"> & {
  action: () => Promise<ActionState>;
  confirmMessage?: string;
  confirmTitle?: string;
  confirmLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  pendingLabel?: string;
};

export function ActionButton({
  action,
  confirmMessage,
  confirmTitle = "Are you sure?",
  confirmLabel = "Confirm",
  confirmVariant = "accent",
  pendingLabel,
  children,
  disabled,
  ...props
}: Props) {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const toast = useToast();

  function execute() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) toast.push("error", result.error);
        else if (result.success) toast.push("success", result.success);
      } catch {
        toast.push("error", "The action could not be completed.");
      } finally {
        setConfirmOpen(false);
      }
    });
  }

  function handleClick() {
    if (confirmMessage) {
      setConfirmOpen(true);
      return;
    }
    execute();
  }

  return (
    <>
      <Button onClick={handleClick} disabled={disabled || pending} {...props}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending && pendingLabel ? pendingLabel : children}
      </Button>

      {confirmMessage ? (
        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={execute}
          title={confirmTitle}
          description={confirmMessage}
          confirmLabel={confirmLabel}
          confirmVariant={confirmVariant}
          pending={pending}
        />
      ) : null}
    </>
  );
}
