import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-5 py-10">
      <div className="w-full max-w-[440px] space-y-6">
        <div className="flex justify-center">
          <Link href="/" aria-label="FocusGate home">
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
  );
}
