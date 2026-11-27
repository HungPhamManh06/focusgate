import { Globe, Monitor, Shield, Smartphone, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type TopologyDevice = {
  id: string;
  name: string;
  platform: string;
  status: string;
};

function classifyPlatform(platform: string): "web" | "pc" | "android" {
  const p = platform.toLowerCase();
  if (p.includes("android") || p.includes("ios") || p.includes("mobile")) {
    return "android";
  }
  if (
    p.includes("win") ||
    p.includes("pc") ||
    p.includes("desktop") ||
    p.includes("mac") ||
    p.includes("linux")
  ) {
    return "pc";
  }
  return "web";
}

function CircuitConnector({ active }: { active: boolean }) {
  return (
    <div className="hidden items-center justify-center md:flex" aria-hidden>
      <svg className="h-6 w-14 overflow-visible" viewBox="0 0 56 24" fill="none">
        <line
          x1="2"
          y1="12"
          x2="54"
          y2="12"
          stroke={active ? "var(--accent)" : "var(--line)"}
          strokeWidth={active ? "1.75" : "1.25"}
          strokeDasharray={active ? "4 3" : "3 4"}
          strokeOpacity={active ? 0.75 : 0.7}
        />
        <circle
          cx="28"
          cy="12"
          r={active ? "3.2" : "2.4"}
          fill={active ? "var(--accent)" : "var(--line)"}
          className={active ? "animate-pulse" : undefined}
        />
      </svg>
    </div>
  );
}

export function EcosystemTopologyCard({
  devices,
  rulesCount,
  isVi,
}: {
  devices: TopologyDevice[];
  rulesCount: number;
  isVi: boolean;
}) {
  const activeDevices = devices.filter((d) => d.status === "active");
  const webCount = Math.max(
    1,
    activeDevices.filter((d) => classifyPlatform(d.platform) === "web").length,
  );
  const pcCount = activeDevices.filter((d) => classifyPlatform(d.platform) === "pc").length;
  const androidCount = activeDevices.filter(
    (d) => classifyPlatform(d.platform) === "android",
  ).length;

  const nodes = [
    {
      key: "web",
      icon: Globe,
      title: isVi ? "Web Workspace" : "Web Workspace",
      subtitle: isVi ? "Trung tâm kế hoạch & ví thưởng" : "Planner & reward hub",
      count: webCount,
      active: true,
      badge: isVi ? "Đang kết nối" : "Connected",
    },
    {
      key: "pc",
      icon: Monitor,
      title: isVi ? "Windows PC Agent" : "Windows PC Agent",
      subtitle: isVi ? "Khóa ứng dụng & thực thi lệnh AI" : "App gate & AI remote actions",
      count: pcCount,
      active: pcCount > 0,
      badge:
        pcCount > 0
          ? isVi
            ? `${pcCount} máy hoạt động`
            : `${pcCount} active`
          : isVi
            ? "Chưa ghép nối"
            : "Not paired",
    },
    {
      key: "android",
      icon: Smartphone,
      title: isVi ? "Android Phone" : "Android Phone",
      subtitle: isVi ? "Chặn app di động & đồng bộ cổng" : "Mobile lock & gate sync",
      count: androidCount,
      active: androidCount > 0,
      badge:
        androidCount > 0
          ? isVi
            ? `${androidCount} máy hoạt động`
            : `${androidCount} active`
          : isVi
            ? "Chưa ghép nối"
            : "Not paired",
    },
  ];

  return (
    <section
      aria-label={isVi ? "Sơ đồ hệ sinh thái FocusGate" : "FocusGate Ecosystem Topology"}
      className="spotlight-card relative mt-7 overflow-hidden rounded-[22px] border border-line bg-surface/92 p-5 shadow-card backdrop-blur-md sm:p-6"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 size-56 rounded-full bg-accent-soft/50 blur-3xl" />

      <div className="relative flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Sparkles className="size-4" strokeWidth={2} />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-ink">
              {isVi ? "FocusGate Ecosystem Hub" : "FocusGate Ecosystem Hub"}
            </p>
            <p className="text-[11.5px] text-muted">
              {isVi
                ? "Đồng bộ Cổng kỷ luật & FocusGate AI Omni-Controller theo thời gian thực"
                : "Real-time Discipline Gate & FocusGate AI Omni-Controller mesh"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-success/30 bg-success-soft px-3 py-1 text-[11px] font-medium text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            {isVi ? "AI Sync Sẵn sàng" : "AI Sync Ready"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 py-1 text-[11px] font-medium text-ink-soft">
            <Shield className="size-3 text-accent" />
            {isVi ? `${rulesCount} quy tắc chặn` : `${rulesCount} block rules`}
          </span>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
        {nodes.map((node, idx) => (
          <div key={node.key} className="contents">
            <div
              className={cn(
                "flex items-center gap-3.5 rounded-2xl border p-4 transition-colors",
                node.active
                  ? "border-accent/30 bg-surface-2/60"
                  : "border-line bg-surface-2/25 opacity-80",
              )}
            >
              <div
                className={cn(
                  "relative flex size-11 shrink-0 items-center justify-center rounded-xl border",
                  node.active
                    ? "border-accent/35 bg-accent-soft text-accent"
                    : "border-line bg-surface text-muted",
                )}
              >
                <node.icon className="size-5" strokeWidth={1.8} />
                <span
                  className={cn(
                    "absolute -right-1 -top-1 size-2.5 rounded-full ring-2 ring-surface",
                    node.active ? "bg-success" : "bg-muted/40",
                  )}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{node.title}</p>
                <p className="mt-0.5 truncate text-[11px] text-muted">{node.subtitle}</p>
                <span
                  className={cn(
                    "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    node.active
                      ? "bg-success-soft text-success"
                      : "bg-surface text-muted",
                  )}
                >
                  {node.badge}
                </span>
              </div>
            </div>
            {idx === 0 ? <CircuitConnector active={pcCount > 0} /> : null}
            {idx === 1 ? <CircuitConnector active={androidCount > 0} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}
