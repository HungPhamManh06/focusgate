import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertDeviceRegistration } from "@/lib/data/devices";
import { friendlyDbError } from "@/lib/data/errors";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";
import { devicePlatforms } from "@/lib/validation";

const registerBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  platform: z.enum(devicePlatforms),
  osVersion: z.string().trim().max(64).optional().nullable(),
  appVersion: z.string().trim().max(64).optional().nullable(),
});

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = registerBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const device = await upsertDeviceRegistration(parsed.data, request);
    return NextResponse.json({
      deviceId: device.id,
      name: device.name,
      platform: device.platform,
      status: device.status,
    });
  } catch (error) {
    const msg = friendlyDbError(error);
    const status = msg.toLowerCase().includes("revoked") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
