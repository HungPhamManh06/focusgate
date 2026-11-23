import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertDiscoveredApps } from "@/lib/data/v2-settings";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

const bodySchema = z.object({
  deviceId: z.string().uuid(),
  platform: z.enum(["windows", "android", "web"]).default("windows"),
  apps: z
    .array(
      z.object({
        identifier: z.string().trim().min(1).max(180),
        displayName: z.string().trim().min(1).max(180),
      }),
    )
    .max(200),
});

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid apps payload" }, { status: 400 });
  }

  const result = await upsertDiscoveredApps(parsed.data, request);
  if (result.status === "forbidden") {
    return NextResponse.json({ error: "Unknown or revoked device" }, { status: 403 });
  }

  return NextResponse.json({ count: result.count });
}
