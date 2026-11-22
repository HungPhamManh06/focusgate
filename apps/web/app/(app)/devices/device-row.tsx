"use client";

import { Check, Globe, Laptop, Loader2, Pencil, ShieldOff, Smartphone, X } from "lucide-react";
import { useState, useTransition } from "react";
import { renameDeviceAction, revokeDeviceAction } from "@/lib/actions/devices";
import type { DeviceRecord } from "@/lib/data/devices";
import { formatDate } from "@/lib/data/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

function PlatformIcon({ platform }: { platform: DeviceRecord["platform"] }) {
  if (platform === "windows") return <Laptop className="size-4" strokeWidth={1.8} />;
  if (platform === "android") return <Smartphone className="size-4" strokeWidth={1.8} />;
  return <Globe className="size-4" strokeWidth={1.8} />;
}

const platformLabels: Record<DeviceRecord["platform"], string> = {
  windows: "Windows agent",
  android: "Android app",
  web: "Web workspace",
};

export function DeviceRow({
  device,
  isCurrentWorkspaceDevice,
  timezone,
}: {
  device: DeviceRecord;
  isCurrentWorkspaceDevice: boolean;
  timezone: string;
}) {
  const [editing, setEditing] = useState(false);
  const [nameInput, setNameInput] = useState(device.name);
  const [confirmRevokeOpen, setConfirmRevokeOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const isRevoked = device.status === "revoked";

  function saveRename(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await renameDeviceAction({ deviceId: device.id, name: nameInput });
      if (result.error) {
        toast.push("error", result.error);
      } else {
        if (result.success) toast.push("success", result.success);
        setEditing(false);
      }
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeDeviceAction(device.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
      setConfirmRevokeOpen(false);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-soft">
          <PlatformIcon platform={device.platform} />
        </span>

        <div className="min-w-0 flex-1">
          {editing ? (
            <form onSubmit={saveRename} className="flex flex-wrap items-center gap-2">
              <Input
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                aria-label="Device name"
                maxLength={80}
                required
                autoFocus
                className="h-8 max-w-xs text-[13px]"
              />
              <Button type="submit" variant="primary" size="sm" disabled={pending}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setNameInput(device.name);
                  setEditing(false);
                }}
              >
                <X className="size-3.5" /> Cancel
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-medium text-ink">{device.name}</p>
              {isCurrentWorkspaceDevice ? <Badge tone="accent">This workspace</Badge> : null}
              <Badge tone={isRevoked ? "danger" : "success"}>
                {isRevoked ? "Revoked" : "Active"}
              </Badge>
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
            <span>{platformLabels[device.platform]}</span>
            {device.appVersion ? (
              <>
                <span aria-hidden>·</span>
                <span>v{device.appVersion}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>
              {device.lastSeenAt
                ? `Last seen ${formatDate(device.lastSeenAt, undefined, timezone)}`
                : `Added ${formatDate(device.createdAt, undefined, timezone)}`}
            </span>
          </div>
        </div>
      </div>

      {!editing ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {!isRevoked ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setNameInput(device.name);
                  setEditing(true);
                }}
              >
                <Pencil className="size-3.5" /> Rename
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmRevokeOpen(true)}
                className="text-danger hover:bg-danger-soft hover:text-danger"
              >
                <ShieldOff className="size-3.5" /> Revoke
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRevokeOpen}
        onClose={() => setConfirmRevokeOpen(false)}
        onConfirm={revoke}
        eyebrow="Revoke device"
        title={`Revoke "${device.name}"?`}
        description={
          <>
            Revoking immediately cancels any open focus session on this device, revokes active
            entertainment grants issued to it, and blocks future sync until re-registered.
          </>
        }
        confirmLabel="Revoke device"
        confirmVariant="danger"
        pending={pending}
      />
    </div>
  );
}
