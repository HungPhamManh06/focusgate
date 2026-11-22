import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentPolicyForDevice } from "@/lib/data/devices";
import { isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();

async function isAuthorizedRequest(request: Request): Promise<boolean> {
  if (!isSupabaseConfigured()) return true;

  const supabase = await createSupabaseServerClient();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();

  return Boolean(user);
}

export async function GET(request: Request) {
  if (!(await isAuthorizedRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  const parsed = uuidSchema.safeParse(deviceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid deviceId UUID is required" }, { status: 400 });
  }

  const outcome = await getAgentPolicyForDevice(parsed.data);
  if (outcome.status === "forbidden") {
    return NextResponse.json({ error: "Unknown or revoked device" }, { status: 403 });
  }

  return NextResponse.json(outcome.policy);
}
