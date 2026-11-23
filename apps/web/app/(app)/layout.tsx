import Link from "next/link";
import { redirect } from "next/navigation";
import { formatMinutes, initials } from "@/lib/data/format";
import { getWalletSummary } from "@/lib/data/rewards";
import { getV2Settings } from "@/lib/data/v2-settings";
import { getWorkspace } from "@/lib/data/workspace";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [workspaceResult, walletSummaryResult, authUser, v2Settings] = await Promise.all([
    getWorkspace()
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        message: error instanceof Error ? error.message : String(error),
      })),
    getWalletSummary()
      .then((minutes) => ({ minutes, error: false }))
      .catch(() => ({ minutes: null, error: true })),
    getAuthenticatedUser().catch(() => null),
    getV2Settings().catch(() => null),
  ]);

  if (!workspaceResult.ok) {
    if (workspaceResult.message.toLowerCase().includes("unauthorized")) {
      redirect("/login");
    }
    throw new Error(workspaceResult.message);
  }
  const workspace = workspaceResult.data;

  const effectiveDisplayName =
    (typeof authUser?.user_metadata?.display_name === "string" &&
      authUser.user_metadata.display_name.trim()) ||
    authUser?.email?.split("@")[0] ||
    workspace.profile.displayName;

  return (
    <ToastProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-xl focus:border focus:border-accent focus:bg-surface focus:px-4 focus:py-2 focus:text-[12.5px] focus:font-medium focus:text-ink focus:shadow-lift"
      >
        Skip to main content
      </a>

      <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
        <Sidebar
          displayName={effectiveDisplayName}
          availableMinutes={walletSummaryResult.minutes}
          walletError={walletSummaryResult.error}
          authEmail={authUser?.email ?? null}
          language={v2Settings?.language ?? "en"}
        />

        <div className="flex min-h-screen min-w-0 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/85 px-5 backdrop-blur-md lg:hidden">
            <Link href="/" aria-label="FocusGate home">
              <Logo />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/devices"
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink-soft"
              >
                Devices
              </Link>
              <Link
                href="/wallet"
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink-soft"
              >
                {walletSummaryResult.minutes !== null
                  ? formatMinutes(walletSummaryResult.minutes)
                  : "Wallet"}
              </Link>
              <span
                title={`${workspace.profile.displayName} · Local workspace`}
                aria-label={`Workspace user: ${workspace.profile.displayName}`}
                className="flex size-8 items-center justify-center rounded-full bg-ink text-[10.5px] font-semibold text-canvas"
              >
                {initials(workspace.profile.displayName)}
              </span>
              <ThemeToggle />
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className="flex-1 pb-24 focus:outline-none lg:pb-0">
            {children}
          </main>

          <MobileNav language={v2Settings?.language ?? "en"} />
        </div>
      </div>
    </ToastProvider>
  );
}
