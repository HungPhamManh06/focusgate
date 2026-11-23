"use client";

import { Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import {
  createBlockRuleAction,
  deleteBlockRuleAction,
  toggleBlockRuleAction,
} from "@/lib/actions/devices";
import type { BlockRuleRecord, DeviceRecord } from "@/lib/data/devices";
import { useLocale } from "@/components/i18n/language-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function BlockRulesCard({
  devices,
  rules,
}: {
  devices: DeviceRecord[];
  rules: BlockRuleRecord[];
}) {
  const isVi = useLocale() === "vi";
  const activeDevices = devices.filter((device) => device.status === "active");
  const [deviceId, setDeviceId] = useState(activeDevices[0]?.id ?? "");
  const [ruleType, setRuleType] = useState<"block" | "allow">("block");
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [category, setCategory] = useState<BlockRuleRecord["category"]>("games");
  const [action, setAction] = useState<BlockRuleRecord["action"]>("overlay");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function addRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createBlockRuleAction({
        deviceId,
        ruleType,
        identifier,
        displayName,
        category,
        action,
      });
      if (result.error) {
        toast.push("error", result.error);
      } else {
        if (result.success) toast.push("success", result.success);
        setIdentifier("");
        setDisplayName("");
      }
    });
  }

  function toggle(rule: BlockRuleRecord) {
    startTransition(async () => {
      const result = await toggleBlockRuleAction(rule.id, !rule.isEnabled);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  function remove(rule: BlockRuleRecord) {
    startTransition(async () => {
      const result = await deleteBlockRuleAction(rule.id);
      if (result.error) toast.push("error", result.error);
      else if (result.success) toast.push("success", result.success);
    });
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle>{isVi ? "Quy tắc khóa ứng dụng" : "App lock policy rules"}</CardTitle>
          <p className="mt-1 text-[12px] text-muted">
            {isVi
              ? "Cấu hình ứng dụng bị chặn hoặc cho phép đồng bộ tới Windows và Android qua "
              : "Configure blocked or allowlisted apps synced to Windows and Android agents via "}
            <code className="text-ink">/api/agent/policy</code>.
          </p>
        </div>
        <span className="text-[12px] text-muted">
          {rules.length} {isVi ? "quy tắc" : "rules"}
        </span>
      </CardHeader>

      <CardContent className="space-y-5 pt-4">
        {activeDevices.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3 text-[12.5px] text-muted">
            <ShieldAlert className="size-4 shrink-0" />
            {isVi
              ? "Hãy đăng ký ít nhất một thiết bị đang hoạt động trước khi gắn quy tắc khóa."
              : "Register an active device first to attach app lock rules."}
          </div>
        ) : (
          <form onSubmit={addRule} className="grid gap-3 rounded-xl border border-line bg-surface-2/60 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-2">
              <Label htmlFor="rule-device">{isVi ? "Thiết bị" : "Device"}</Label>
              <Select
                id="rule-device"
                value={deviceId}
                onChange={(event) => setDeviceId(event.target.value)}
              >
                {activeDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name} ({device.platform})
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="rule-type">{isVi ? "Loại" : "Type"}</Label>
              <Select
                id="rule-type"
                value={ruleType}
                onChange={(event) => setRuleType(event.target.value as "block" | "allow")}
              >
                <option value="block">{isVi ? "Chặn" : "Block"}</option>
                <option value="allow">{isVi ? "Cho phép" : "Allowlist"}</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="rule-category">{isVi ? "Danh mục" : "Category"}</Label>
              <Select
                id="rule-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as BlockRuleRecord["category"])}
              >
                <option value="games">{isVi ? "Trò chơi" : "Games"}</option>
                <option value="social">{isVi ? "Mạng xã hội" : "Social"}</option>
                <option value="video">Video</option>
                <option value="entertainment">{isVi ? "Giải trí" : "Entertainment"}</option>
                <option value="other">{isVi ? "Khác" : "Other"}</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="rule-action">{isVi ? "Hành động" : "Action"}</Label>
              <Select
                id="rule-action"
                value={action}
                onChange={(event) => setAction(event.target.value as BlockRuleRecord["action"])}
              >
                <option value="overlay">{isVi ? "Che màn hình" : "Overlay"}</option>
                <option value="minimize">{isVi ? "Thu nhỏ" : "Minimize"}</option>
                <option value="terminate">{isVi ? "Đóng app" : "Terminate"}</option>
                <option value="notify">{isVi ? "Thông báo" : "Notify"}</option>
              </Select>
            </div>

            <div>
              <Label htmlFor="rule-display-name">{isVi ? "Tên hiển thị" : "Display name"}</Label>
              <Input
                id="rule-display-name"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Steam / TikTok"
                maxLength={200}
                required
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-4">
              <Label htmlFor="rule-identifier">
                {isVi ? "Tên tiến trình / gói ứng dụng" : "Process / package identifier"}
              </Label>
              <Input
                id="rule-identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="steam.exe or com.zhiliaoapp.musically"
                maxLength={256}
                required
              />
            </div>

            <div className="flex items-end sm:col-span-2">
              <Button type="submit" variant="primary" size="md" disabled={pending} className="w-full">
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                {isVi ? "Thêm quy tắc" : "Add rule"}
              </Button>
            </div>
          </form>
        )}

        {rules.length === 0 ? (
          <p className="py-4 text-center text-[12.5px] text-muted">
            {isVi ? "Chưa có quy tắc khóa ứng dụng nào." : "No app lock rules configured yet."}
          </p>
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={cn("text-[13.5px] font-medium", !rule.isEnabled && "text-muted line-through")}>
                      {rule.displayName}
                    </p>
                    <Badge tone={rule.ruleType === "block" ? "danger" : "success"}>
                      {rule.ruleType === "block"
                        ? isVi ? "Chặn" : "Block"
                        : isVi ? "Cho phép" : "Allow"}
                    </Badge>
                    {!rule.isEnabled ? (
                      <Badge tone="neutral">{isVi ? "Tạm dừng" : "Paused"}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12px] text-muted">
                    <code className="text-ink-soft">{rule.identifier}</code> · {rule.deviceName} ·{" "}
                    {rule.category} · {rule.action}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => toggle(rule)}
                  >
                    {rule.isEnabled
                      ? isVi ? "Tắt" : "Disable"
                      : isVi ? "Bật" : "Enable"}
                  </Button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove(rule)}
                    aria-label={`Delete ${rule.displayName}`}
                    className="flex size-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
