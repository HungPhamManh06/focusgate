"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/language-provider";

export function NetworkStatusBanner() {
  const isVi = useLocale() === "vi";
  const [status, setStatus] = useState<"online" | "offline" | "reconnected">("online");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!navigator.onLine) setStatus("offline");

    let timer: number | null = null;
    const onOffline = () => {
      if (timer) window.clearTimeout(timer);
      setStatus("offline");
    };
    const onOnline = () => {
      setStatus("reconnected");
      timer = window.setTimeout(() => setStatus("online"), 3000);
    };

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  if (status === "online") return null;

  const isOffline = status === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 top-3 z-[90] flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-1.5 text-[12px] font-semibold shadow-lift backdrop-blur-md ${
        isOffline
          ? "border-warning/40 bg-warning-soft text-warning"
          : "border-success/40 bg-success-soft text-success"
      }`}
    >
      {isOffline ? <WifiOff className="size-3.5" /> : <Wifi className="size-3.5" />}
      <span>
        {isOffline
          ? isVi
            ? "Mất kết nối mạng — đang chờ đồng bộ lại…"
            : "Offline — waiting to reconnect…"
          : isVi
            ? "Đã kết nối lại mạng."
            : "Back online."}
      </span>
    </div>
  );
}
