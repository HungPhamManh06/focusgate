"use client";

import { Loader2, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AuthMode = "signin" | "signup" | "reset";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    startTransition(async () => {
      try {
        const supabase = createSupabaseBrowserClient();

        if (mode === "signin") {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });
          if (signInError) {
            setError(signInError.message);
            return;
          }
          router.push(nextPath);
          router.refresh();
          return;
        }

        if (mode === "signup") {
          const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
          const { data, error: signUpError } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: {
              emailRedirectTo: redirectTo,
              data: displayName.trim() ? { display_name: displayName.trim() } : undefined,
            },
          });
          if (signUpError) {
            setError(signUpError.message);
            return;
          }
          if (data.session) {
            router.push(nextPath);
            router.refresh();
          } else {
            setMessage("Check your inbox to confirm your email address, then sign in.");
          }
          return;
        }

        const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/")}`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo,
        });
        if (resetError) {
          setError(resetError.message);
          return;
        }
        setMessage("Password reset instructions have been sent if an account exists for that email.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Authentication failed.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-surface-2 p-1">
        {(
          [
            { id: "signin", label: "Sign in" },
            { id: "signup", label: "Sign up" },
            { id: "reset", label: "Reset" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              setMode(tab.id);
              setError(null);
              setMessage(null);
            }}
            className={cn(
              "rounded-lg py-1.5 text-[12px] font-medium transition-colors",
              mode === tab.id ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-[12.5px] text-danger">
          {error}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-[12.5px] text-success">
          {message}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "signup" ? (
          <div>
            <Label htmlFor="auth-display-name">Display name</Label>
            <Input
              id="auth-display-name"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Alex Morgan"
              maxLength={80}
            />
          </div>
        ) : null}

        <div>
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </div>

        {mode !== "reset" ? (
          <div>
            <Label htmlFor="auth-password">Password</Label>
            <Input
              id="auth-password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
            />
          </div>
        ) : null}

        <Button type="submit" variant="accent" size="lg" disabled={pending} className="w-full">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          {mode === "signin"
            ? "Sign in"
            : mode === "signup"
              ? "Create account"
              : "Send reset email"}
        </Button>
      </form>
    </div>
  );
}
