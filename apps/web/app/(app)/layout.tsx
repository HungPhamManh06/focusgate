import Link from "next/link";
import { formatMinutes } from "@/lib/data/format";
import { getWalletSummary } from "@/lib/data/rewards";
import { getWorkspace } from "@/lib/data/workspace";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { ToastProvider } from "@/components/ui/toast";
import { MobileNav } from "@/components/shell/mobile-nav";
import { Sidebar } from "@/components/shell/sidebar";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [workspace, availableMinutes] = await Promise.all([getWorkspace(), getWalletSummary()]);

  return (
    <ToastProvider>
      <div className="min-h-screen lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
        <Sidebar displayName={workspace.profile.displayName} availableMinutes={availableMinutes} />

        <div className="flex min-h-screen flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-canvas/85 px-5 backdrop-blur-md lg:hidden">
            <Link href="/" aria-label="FocusGate home">
              <Logo />
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/wallet"
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-[11.5px] font-medium text-ink-soft"
              >
                {formatMinutes(availableMinutes)}
              </Link>
              <ThemeToggle />
            </div>
          </header>

          <main className="flex-1 pb-24 lg:pb-0">{children}</main>

          <MobileNav />
        </div>
      </div>
    </ToastProvider>
  );
}
