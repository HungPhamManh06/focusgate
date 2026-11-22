import "server-only";

import { cache } from "react";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabasePublicEnv, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "./server";

export interface SupabaseSessionContext {
  supabase: SupabaseClient;
  userId: string;
  user: User;
}

function createBearerClient(bearer: string): SupabaseClient {
  const { url, anonKey } = getSupabasePublicEnv();
  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${bearer}`,
      },
    },
  });
}

const getCookieSupabaseContext = cache(async (): Promise<SupabaseSessionContext | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Unauthorized: please sign in.");
  }

  return { supabase, userId: user.id, user };
});

/**
 * Returns an authenticated Supabase client and user ID when Supabase is configured,
 * or `null` when running in local PGlite fallback mode.
 */
export async function getSupabaseContext(
  request?: Request,
): Promise<SupabaseSessionContext | null> {
  if (!isSupabaseConfigured()) return null;

  const authHeader = request?.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!bearer) {
    return getCookieSupabaseContext();
  }

  const supabase = createBearerClient(bearer);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(bearer);

  if (error || !user) {
    throw new Error("Unauthorized: please sign in.");
  }

  return { supabase, userId: user.id, user };
}

export function unwrapSupabase<T>(
  result: { data: T | null; error: { message: string } | null },
  fallbackMessage = "Database request failed.",
): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error(fallbackMessage);
  return result.data;
}

export function assertSupabaseOk(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

export function localDateInTimezone(timezone: string, date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export const getSupabaseUserTimezone = cache(
  async (supabase: SupabaseClient, userId: string): Promise<string> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.timezone as string | undefined) ?? "UTC";
  },
);
