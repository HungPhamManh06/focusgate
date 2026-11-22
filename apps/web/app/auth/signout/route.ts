import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { origin } = new URL(request.url);
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
