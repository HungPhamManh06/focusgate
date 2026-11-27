"use client";

import type { AiClientCommand, AiDeviceCommand } from "@/lib/domain/ai-assistant";

interface RouterLike {
  push: (href: string) => void;
  refresh: () => void;
}

export function getWebView2Bridge(): { postMessage: (msg: string) => void } | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    chrome?: { webview?: { postMessage?: (msg: string) => void } };
  };
  const bridge = win.chrome?.webview;
  return bridge && typeof bridge.postMessage === "function"
    ? { postMessage: (msg: string) => bridge.postMessage!(msg) }
    : null;
}

export function executeWebAiCommands(input: {
  clientCommands?: AiClientCommand[];
  deviceCommand?: AiDeviceCommand | null;
  router: RouterLike;
  shouldRefresh?: boolean;
}) {
  const { clientCommands = [], deviceCommand, router, shouldRefresh } = input;
  const webView = getWebView2Bridge();
  let handledUrlInPc = false;

  // 1. If running inside FocusGate Windows PC app (WebView2), dispatch native PC command immediately (<50ms)
  if (
    webView &&
    deviceCommand &&
    (deviceCommand.targetPlatform === "windows" || deviceCommand.targetPlatform === "any")
  ) {
    webView.postMessage(
      JSON.stringify({
        type: "focusgate_device_command",
        command: deviceCommand,
      }),
    );
    if (deviceCommand.type === "open_url_in_browser") {
      handledUrlInPc = true;
    }
  }

  // 2. Execute direct Web App UI actions
  for (const cmd of clientCommands) {
    if (cmd.type === "navigate") {
      router.push(cmd.path);
    } else if (cmd.type === "set_theme") {
      const nextDark =
        cmd.mode === "toggle"
          ? !document.documentElement.classList.contains("dark")
          : cmd.mode === "dark";
      document.documentElement.classList.toggle("dark", nextDark);
      try {
        window.localStorage.setItem("focusgate-theme", nextDark ? "dark" : "light");
      } catch {
        // Ignore storage errors
      }
    } else if (cmd.type === "open_url" && !handledUrlInPc) {
      window.open(cmd.url, "_blank", "noopener,noreferrer");
    }
  }

  if (shouldRefresh) {
    router.refresh();
  }
}
