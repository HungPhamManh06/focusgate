"use client";

import { Check, Globe, Laptop, Loader2, Pencil, ShieldOff, Smartphone, X } from "lucide-react";
import { useState, useTransition } from "react";
import { renameDeviceAction, revokeDeviceAction } from "@/lib/actions/devices";
import type { DeviceRecord } from "@/lib/data/devices";
import { formatDate } from "@/lib/data/format";
import { useLocale } from "@/components/i18n/language-provider";
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
  const locale = useLocale();
  const isVi = locale === "vi";
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
    <div className="flex flex-col gap-3 border-b border-line px-5 py-4 transition-colors last:border-b-0 hover:bg-surface-2/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={`relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border ${
            device.platform === "android"
              ? "border-success/30 bg-success-soft/50 text-success"
              : device.platform === "windows"
                ? "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400"
                : "border-accent/30 bg-accent-soft/60 text-accent"
          }`}
        >
          <PlatformIcon platform={device.platform} />
          <span
            aria-hidden
            className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface ${
              isRevoked ? "bg-muted" : "bg-success"
            }`}
          />
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
                {isVi ? "Lưu" : "Save"}
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
                <X className="size-3.5" /> {isVi ? "Hủy" : "Cancel"}
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[14px] font-medium text-ink">{device.name}</p>
              {isCurrentWorkspaceDevice ? (
                <Badge tone="accent">{isVi ? "Thiết bị này" : "This workspace"}</Badge>
              ) : null}
              <Badge tone={isRevoked ? "danger" : "success"}>
                {isRevoked
                  ? isVi ? "Đã thu hồi" : "Revoked"
                  : isVi ? "Đang hoạt động" : "Active"}
              </Badge>
            </div>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
            <span>
              {isVi
                ? device.platform === "windows"
                  ? "Ứng dụng Windows"
                  : device.platform === "android"
                    ? "Ứng dụng Android"
                    : "Trình duyệt Web"
                : platformLabels[device.platform]}
            </span>
            {device.appVersion ? (
              <>
                <span aria-hidden>·</span>
                <span>v{device.appVersion}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span>
              {device.lastSeenAt
                ? `${isVi ? "Hoạt động cuối" : "Last seen"} ${formatDate(device.lastSeenAt, undefined, timezone, locale)}`
                : `${isVi ? "Đã thêm" : "Added"} ${formatDate(device.createdAt, undefined, timezone, locale)}`}
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
                <Pencil className="size-3.5" /> {isVi ? "Đổi tên" : "Rename"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setConfirmRevokeOpen(true)}
                className="text-danger hover:bg-danger-soft hover:text-danger"
              >
                <ShieldOff className="size-3.5" /> {isVi ? "Thu hồi" : "Revoke"}
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmRevokeOpen}
        onClose={() => setConfirmRevokeOpen(false)}
        onConfirm={revoke}
        eyebrow={isVi ? "Thu hồi thiết bị" : "Revoke device"}
        title={isVi ? `Thu hồi "${device.name}"?` : `Revoke "${device.name}"?`}
        description={
          isVi ? (
            <>
              Thu hồi sẽ hủy ngay mọi phiên tập trung đang mở trên thiết bị này, thu hồi quyền giải
              trí đang cấp và chặn đồng bộ cho đến khi đăng ký lại.
            </>
          ) : (
            <>
              Revoking immediately cancels any open focus session on this device, revokes active
              entertainment grants issued to it, and blocks future sync until re-registered.
            </>
          )
        }
        confirmLabel={isVi ? "Thu hồi thiết bị" : "Revoke device"}
        confirmVariant="danger"
        pending={pending}
      />
    </div>
  );
}
