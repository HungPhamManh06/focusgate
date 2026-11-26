import Link from "next/link";
import { ArrowRight, Chrome, Laptop, ShieldCheck, Smartphone } from "lucide-react";
import { LivingGateVisual } from "@/components/domain/living-gate-visual";
import { Logo } from "@/components/ui/logo";
import { buttonVariants } from "@/components/ui/button";
import { isSupabaseConfigured, sanitizeNextPath } from "@/lib/env";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string; error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextPath = sanitizeNextPath(params.next);
  const configured = isSupabaseConfigured();

  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-2">
      {/* Left Editorial Brand Showcase */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-[#241215] via-[#150c0e] to-[#0b0708] p-12 text-[#faf7f5] lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 size-96 rounded-full bg-[#b91c1c]/20 blur-3xl"
        />
        <div className="relative z-10 flex items-center justify-between">
          <Link href="/welcome" aria-label="FocusGate welcome">
            <Logo />
          </Link>
          <Link
            href="/welcome"
            className="text-[12.5px] font-medium text-[#d9cbcd] transition-colors hover:text-white"
          >
            Khám phá FocusGate →
          </Link>
        </div>

        <div className="relative z-10 my-auto flex flex-col items-start gap-7 py-8">
          <LivingGateVisual
            status="active"
            mustDoCompleted={2}
            mustDoTotal={3}
            isUnlocked={false}
            locale="vi"
            themeId="stone"
          />
          <div className="max-w-md space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f87171]">
              The Living Gate · Earned Freedom
            </p>
            <h2 className="font-display text-[38px] leading-[1.08] tracking-[-0.02em] text-white">
              Hoàn thành nhiệm vụ. Tự do giải trí.
            </h2>
            <p className="text-[14px] leading-relaxed text-[#c9b8bb]">
              Khóa xao nhãng đồng bộ trên điện thoại, máy tính và trình duyệt cho đến khi các việc
              Bắt buộc hôm nay hoàn tất.
            </p>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap gap-4 border-t border-white/10 pt-5 text-[12px] text-[#b4a3a6]">
          <span className="inline-flex items-center gap-1.5">
            <Smartphone className="size-3.5 text-[#f87171]" /> Android Guard
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Laptop className="size-3.5 text-[#f87171]" /> Windows Agent
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Chrome className="size-3.5 text-[#f87171]" /> YouTube Study Mode
          </span>
        </div>
      </div>

      {/* Right Auth Column */}
      <div className="flex flex-col items-center justify-center px-5 py-10">
        <div className="w-full max-w-[430px] space-y-6">
          <div className="flex justify-center lg:hidden">
            <Link href="/welcome" aria-label="FocusGate home">
              <Logo />
            </Link>
          </div>

          <div className="surface-card p-6 sm:p-8">
            <div className="text-center">
              <p className="label-xs text-muted">Account access</p>
              <h1 className="mt-2 font-display text-[32px] leading-none tracking-[-0.01em] text-ink">
                Finish your tasks.
              </h1>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Sign in to sync your daily gate, verified focus blocks, and reward balance across devices.
              </p>
            </div>

            {params.error ? (
              <div className="mt-5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
                {params.error}
              </div>
            ) : null}

            {!configured ? (
              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-line bg-surface-2 p-4 text-[12.5px] leading-relaxed text-ink-soft">
                  <div className="flex items-center gap-2 font-semibold text-ink">
                    <ShieldCheck className="size-4 text-accent" />
                    Local PGlite Dev Mode
                  </div>
                  <p className="mt-1.5 text-muted">
                    Supabase public credentials (<code className="text-ink">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                    <code className="text-ink">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) are not configured in{" "}
                    <code className="text-ink">.env.local</code>, so authentication is bypassed for local workspace testing.
                  </p>
                </div>
                <Link
                  href={nextPath}
                  className={buttonVariants({ variant: "accent", size: "lg", className: "w-full" })}
                >
                  Continue to local workspace <ArrowRight className="size-4" />
                </Link>
              </div>
            ) : (
              <div className="mt-6">
                <LoginForm nextPath={nextPath} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
