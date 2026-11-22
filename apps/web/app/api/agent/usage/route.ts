import { NextResponse } from "next/server";
import { ingestUsageEvents } from "@/lib/data/devices";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";
import { usageBatchSchema } from "@/lib/validation";

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

  const parsed = usageBatchSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid usage batch" },
      { status: 400 },
    );
  }

  const outcome = await ingestUsageEvents(parsed.data);
  if (outcome.status === "forbidden") {
    return NextResponse.json({ error: "Unknown or revoked device" }, { status: 403 });
  }

  return NextResponse.json({
    accepted: outcome.accepted,
    duplicates: outcome.duplicates,
  });
}
