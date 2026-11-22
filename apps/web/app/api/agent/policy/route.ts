import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentPolicyForDevice } from "@/lib/data/devices";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

const uuidSchema = z.string().uuid();

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  const parsed = uuidSchema.safeParse(deviceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Valid deviceId UUID is required" }, { status: 400 });
  }

  const outcome = await getAgentPolicyForDevice(parsed.data, request);
  if (outcome.status === "forbidden") {
    return NextResponse.json({ error: "Unknown or revoked device" }, { status: 403 });
  }

  return NextResponse.json(outcome.policy);
}
