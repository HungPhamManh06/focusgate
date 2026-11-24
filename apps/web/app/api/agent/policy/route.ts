import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentPolicyForDevice } from "@/lib/data/devices";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const uuidSchema = z.string().uuid();
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get("deviceId");
  const parsed = uuidSchema.safeParse(deviceId);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Valid deviceId UUID is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const outcome = await getAgentPolicyForDevice(parsed.data, request);
  if (outcome.status === "forbidden") {
    return NextResponse.json(
      { error: "Unknown or revoked device" },
      { status: 403, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(outcome.policy, { headers: NO_STORE_HEADERS });
}
