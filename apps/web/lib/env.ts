export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

const PLACEHOLDER_URLS = new Set([
  "https://your-project-ref.supabase.co",
  "http://your-project-ref.supabase.co",
]);

const PLACEHOLDER_KEYS = new Set(["your-anon-key", "changeme"]);

export function parseSupabasePublicEnv(env: {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}): SupabasePublicEnv | null {
  const rawUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const rawKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
  if (!rawUrl || !rawKey) return null;
  if (PLACEHOLDER_URLS.has(rawUrl) || PLACEHOLDER_KEYS.has(rawKey)) return null;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { url: rawUrl, anonKey: rawKey };
}

export function isSupabaseConfigured(): boolean {
  return parseSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  }) !== null;
}

export function getSupabasePublicEnv(): SupabasePublicEnv {
  const parsed = parseSupabasePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed) {
    throw new Error(
      "Supabase public environment variables (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) are not configured.",
    );
  }
  return parsed;
}

export function sanitizeNextPath(rawNext: string | null | undefined, fallback = "/"): string {
  if (!rawNext) return fallback;
  const trimmed = rawNext.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
    return fallback;
  }
  return trimmed;
}
