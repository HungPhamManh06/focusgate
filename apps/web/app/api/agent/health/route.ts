import { NextResponse } from "next/server";
import { z } from "zod";
import { upsertDailyHealthMetrics } from "@/lib/data/health";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

const bodySchema = z.object({
  deviceId: z.string().uuid().optional().nullable(),
  metrics: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        steps: z.number().int().min(0).max(200_000),
        sleepMinutes: z.number().int().min(0).max(1440),
        avgHeartRate: z.number().int().min(30).max(240).optional().nullable(),
        activeCalories: z.number().int().min(0).max(20_000),
        weightKg: z.number().min(20).max(300).optional().nullable(),
        source: z.string().max(40).optional(),
      }),
    )
    .max(31),
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
    return NextResponse.json({ error: "Invalid health metrics payload" }, { status: 400 });
  }

  try {
    const result = await upsertDailyHealthMetrics(parsed.data, request);
    if (result.status === "forbidden") {
      return NextResponse.json({ error: "Unknown or revoked device" }, { status: 403 });
    }
    return NextResponse.json({ count: result.count });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not save health metrics" },
      { status: 500 },
    );
  }
}
