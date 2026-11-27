import { NextResponse } from "next/server";
import { z } from "zod";
import { runFocusGateAi } from "@/lib/data/ai-assistant-service";
import { friendlyDbError } from "@/lib/data/errors";
import type { AiDeviceCommand } from "@/lib/domain/ai-assistant";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const aiRequestSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(800),
  confirmUnlock: z.boolean().optional(),
  pendingCommand: z.record(z.string(), z.unknown()).nullable().optional(),
  sourcePlatform: z.enum(["web", "windows", "android"]).optional(),
});

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = aiRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message payload" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const result = await runFocusGateAi(parsed.data.message, request, {
      confirmUnlock: parsed.data.confirmUnlock,
      pendingCommand: (parsed.data.pendingCommand ?? null) as AiDeviceCommand | null,
      sourcePlatform: parsed.data.sourcePlatform ?? "web",
    });
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyDbError(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
