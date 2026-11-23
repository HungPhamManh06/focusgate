import { NextResponse } from "next/server";
import { z } from "zod";
import { activateUnlockPass } from "@/lib/data/v2-settings";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

const bodySchema = z.object({
  minutes: z.number().int().min(5).max(60).default(10),
});

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown = {};
  try {
    json = await request.json();
  } catch {
    json = {};
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid minutes value" }, { status: 400 });
  }

  try {
    const result = await activateUnlockPass(parsed.data.minutes, request);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not activate unlock pass" },
      { status: 400 },
    );
  }
}
