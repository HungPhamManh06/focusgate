import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      accessToken: "local-dev-token",
      refreshToken: null,
      email: "local@focusgate.dev",
    });
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token ?? null,
    email: session.user?.email ?? null,
  });
}
