import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ackDeviceCommand,
  enqueueDeviceCommand,
  pollPendingDeviceCommands,
} from "@/lib/data/device-commands";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ack"),
    commandId: z.string().uuid(),
    status: z.enum(["executed", "failed"]).default("executed"),
    resultMessage: z.string().max(400).nullable().optional(),
  }),
  z.object({
    action: z.literal("enqueue"),
    targetPlatform: z.enum(["windows", "android", "any"]).default("any"),
    commandType: z.string().min(1).max(64),
    payload: z.record(z.string(), z.unknown()).default({}),
  }),
]);

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const { searchParams } = new URL(request.url);
  const platformParam = searchParams.get("platform");
  const platform = platformParam === "android" ? "android" : "windows";

  const commands = await pollPendingDeviceCommands(platform, request);
  return NextResponse.json({ commands }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (parsed.data.action === "ack") {
    const ok = await ackDeviceCommand(parsed.data, request);
    return NextResponse.json({ ok }, { headers: NO_STORE_HEADERS });
  }

  const created = await enqueueDeviceCommand(
    {
      targetPlatform: parsed.data.targetPlatform,
      commandType: parsed.data.commandType,
      payload: parsed.data.payload,
    },
    request,
  );
  return NextResponse.json({ command: created }, { headers: NO_STORE_HEADERS });
}
