import { NextResponse } from "next/server";
import { z } from "zod";
import { completeAgentPlanTask } from "@/lib/data/agent-plan";
import { friendlyDbError } from "@/lib/data/errors";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

const completeBodySchema = z.object({
  planTaskId: z.string().uuid(),
  deviceId: z.string().uuid().optional().nullable(),
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

  const parsed = completeBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  try {
    const snapshot = await completeAgentPlanTask(parsed.data, request);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  }
}
