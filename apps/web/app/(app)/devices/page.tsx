import { Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDurationSeconds, formatTime } from "@/lib/data/format";
import { listBlockRules, listDevices, listRecentUsageEvents } from "@/lib/data/devices";
import { getWorkspace } from "@/lib/data/workspace";
import { BlockRulesCard } from "./block-rules-card";
import { DeviceRow } from "./device-row";
import { RegisterDeviceForm } from "./register-device-form";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const [workspace, devices, rules, usageEvents] = await Promise.all([
    getWorkspace(),
    listDevices(),
    listBlockRules(),
    listRecentUsageEvents(10),
  ]);
  const activeCount = devices.filter((device) => device.status === "active").length;
  const revokedCount = devices.length - activeCount;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow="Connected devices"
        title="One account, bounded devices."
        description="Register your Windows agent, Android phone, or Web workspace. Revoking a device immediately closes its active focus session and revokes its grants."
      />

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Total devices"
          value={String(devices.length)}
          hint="Registered to your account"
          icon={Laptop}
          tone="accent"
        />
        <StatCard
          label="Active"
          value={String(activeCount)}
          hint="Allowed to start focus and spend rewards"
          icon={ShieldCheck}
          tone={activeCount > 0 ? "success" : "default"}
        />
        <StatCard
          label="Revoked"
          value={String(revokedCount)}
          hint="Blocked from syncing or spending"
          icon={ShieldOff}
          tone={revokedCount > 0 ? "warning" : "default"}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>Registered devices</CardTitle>
            <span className="text-[12px] text-muted">{devices.length} total</span>
          </CardHeader>
          {devices.length === 0 ? (
            <EmptyState
              icon={Laptop}
              title="No devices registered"
              description="Register your first Windows, Android, or Web device to start syncing focus sessions."
              className="border-0 bg-transparent shadow-none"
            />
          ) : (
            <div>
              {devices.map((device) => (
                <DeviceRow
                  key={device.id}
                  device={device}
                  isCurrentWorkspaceDevice={device.id === workspace.device.id}
                  timezone={workspace.profile.timezone}
                />
              ))}
            </div>
          )}
        </Card>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Register a device</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <RegisterDeviceForm />
              <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                Device names must be unique per account. Revoked devices remain in history for
                focus and reward ledger integrity.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="mt-4">
        <BlockRulesCard devices={devices} rules={rules} />
      </div>

      {usageEvents.length > 0 ? (
        <div className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Recent device activity</CardTitle>
              <span className="text-[12px] text-muted">{usageEvents.length} latest events</span>
            </CardHeader>
            <div className="divide-y divide-line">
              {usageEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-[12.5px] sm:px-6"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{evt.displayName ?? evt.identifier}</p>
                    <p className="text-[11.5px] text-muted">
                      {evt.deviceName} · {formatTime(evt.startedAt, workspace.profile.timezone)} ·{" "}
                      {formatDurationSeconds(evt.durationSeconds)}
                    </p>
                  </div>
                  <Badge tone={evt.wasBlocked ? "danger" : "neutral"}>
                    {evt.wasBlocked ? "Blocked" : "Observed"}
                  </Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
