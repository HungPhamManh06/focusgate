"use client";

import { Loader2, Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { registerDeviceAction } from "@/lib/actions/devices";
import type { DevicePlatform } from "@/lib/data/devices";
import { useLocale } from "@/components/i18n/language-provider";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function RegisterDeviceForm() {
  const isVi = useLocale() === "vi";
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<DevicePlatform>("windows");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await registerDeviceAction({ name, platform });
      if (result.error) {
        toast.push("error", result.error);
      } else {
        if (result.success) toast.push("success", result.success);
        setName("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="device-name">{isVi ? "Tên thiết bị" : "Device name"}</Label>
        <Input
          id="device-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={isVi ? "VD: Laptop cá nhân hoặc Redmi Note 13" : "e.g. Work Laptop or Redmi Note 13"}
          maxLength={80}
          required
        />
      </div>

      <div>
        <Label htmlFor="device-platform">{isVi ? "Nền tảng" : "Platform"}</Label>
        <Select
          id="device-platform"
          value={platform}
          onChange={(event) => setPlatform(event.target.value as DevicePlatform)}
        >
          <option value="windows">{isVi ? "Ứng dụng Windows" : "Windows agent"}</option>
          <option value="android">{isVi ? "Ứng dụng Android" : "Android app"}</option>
          <option value="web">{isVi ? "Trình duyệt Web" : "Web workspace"}</option>
        </Select>
      </div>

      <Button type="submit" variant="accent" size="md" disabled={pending} className="w-full">
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        {isVi ? "Đăng ký thiết bị" : "Register device"}
      </Button>
    </form>
  );
}
