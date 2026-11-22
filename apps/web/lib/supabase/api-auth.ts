import "server-only";

import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "./server";

export async function isAuthorizedApiRequest(request: Request): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  const supabase = await createSupabaseServerClient();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();

  return Boolean(user);
}
