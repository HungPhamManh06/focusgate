import { Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { formatDurationSeconds, formatTime } from "@/lib/data/format";
import { listBlockRules, listDevices, listRecentUsageEvents } from "@/lib/data/devices";
import { getV2Settings, listDiscoveredApps } from "@/lib/data/v2-settings";
import { getWorkspace } from "@/lib/data/workspace";
import { BlockRulesCard } from "./block-rules-card";
import { DeviceRow } from "./device-row";
import { GatePreviewCard } from "./gate-preview-card";
import { QuickConnectCard } from "./quick-connect-card";
import { RegisterDeviceForm } from "./register-device-form";
import { V2ProfilesCard } from "./v2-profiles-card";

export const dynamic = "force-dynamic";

export default async function DevicesPage() {
  const [workspace, devices, rules, usageEvents, v2, discoveredApps] = await Promise.all([
    getWorkspace(),
    listDevices(),
    listBlockRules(),
    listRecentUsageEvents(10),
    getV2Settings(),
    listDiscoveredApps(),
  ]);
  const isVi = v2.language === "vi";
  const activeCount = devices.filter((device) => device.status === "active").length;
  const revokedCount = devices.length - activeCount;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 py-8 sm:px-8 sm:py-10">
      <PageHeader
        eyebrow={isVi ? "Thiết bị đã kết nối" : "Connected devices"}
        title={isVi ? "Một tài khoản, nhiều thiết bị đồng bộ." : "One account, bounded devices."}
        description={
          isVi
            ? "Đăng ký Windows agent, điện thoại Android hoặc Web workspace. Thu hồi thiết bị sẽ đóng ngay phiên tập trung đang chạy của thiết bị đó."
            : "Register your Windows agent, Android phone, or Web workspace. Revoking a device immediately closes its active focus session and revokes its grants."
        }
      />

      <section className="mt-8 grid gap-3 sm:grid-cols-3">
        <StatCard
          label={isVi ? "Tổng thiết bị" : "Total devices"}
          value={String(devices.length)}
          hint={isVi ? "Đã đăng ký với tài khoản của bạn" : "Registered to your account"}
          icon={Laptop}
          tone="accent"
        />
        <StatCard
          label={isVi ? "Đang hoạt động" : "Active"}
          value={String(activeCount)}
          hint={isVi ? "Được phép tập trung và dùng thưởng" : "Allowed to start focus and spend rewards"}
          icon={ShieldCheck}
          tone={activeCount > 0 ? "success" : "default"}
        />
        <StatCard
          label={isVi ? "Đã thu hồi" : "Revoked"}
          value={String(revokedCount)}
          hint={isVi ? "Bị chặn đồng bộ hoặc dùng thưởng" : "Blocked from syncing or spending"}
          icon={ShieldOff}
          tone={revokedCount > 0 ? "warning" : "default"}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>{isVi ? "Thiết bị đã đăng ký" : "Registered devices"}</CardTitle>
            <span className="text-[12px] text-muted">
              {devices.length} {isVi ? "tổng" : "total"}
            </span>
          </CardHeader>
          {devices.length === 0 ? (
            <EmptyState
              icon={Laptop}
              title={isVi ? "Chưa có thiết bị nào" : "No devices registered"}
              description={
                isVi
                  ? "Đăng ký thiết bị Windows, Android hoặc Web đầu tiên để đồng bộ phiên tập trung."
                  : "Register your first Windows, Android, or Web device to start syncing focus sessions."
              }
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
              <CardTitle>{isVi ? "Đăng ký thiết bị" : "Register a device"}</CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <RegisterDeviceForm />
              <p className="mt-4 rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                {isVi
                  ? "Tên thiết bị phải là duy nhất trên mỗi tài khoản. Thiết bị đã thu hồi vẫn giữ trong lịch sử để đảm bảo tính toàn vẹn dữ liệu."
                  : "Device names must be unique per account. Revoked devices remain in history for focus and reward ledger integrity."}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <BlockRulesCard devices={devices} rules={rules} />
        <GatePreviewCard rules={rules} />
      </div>

      <QuickConnectCard />

      <V2ProfilesCard settings={v2} discoveredApps={discoveredApps} />

      {usageEvents.length > 0 ? (
        <div className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{isVi ? "Hoạt động thiết bị gần đây" : "Recent device activity"}</CardTitle>
              <span className="text-[12px] text-muted">
                {usageEvents.length} {isVi ? "sự kiện mới nhất" : "latest events"}
              </span>
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
                    {evt.wasBlocked
                      ? isVi ? "Đã chặn" : "Blocked"
                      : isVi ? "Đã ghi nhận" : "Observed"}
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
