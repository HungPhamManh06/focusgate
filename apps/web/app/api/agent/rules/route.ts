import { NextResponse } from "next/server";
import { z } from "zod";
import { friendlyDbError } from "@/lib/data/errors";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";
import { assertSupabaseOk, getSupabaseContext } from "@/lib/supabase/data-client";

const syncRulesSchema = z.object({
  deviceId: z.string().uuid(),
  rules: z
    .array(
      z.object({
        identifier: z.string().trim().min(1).max(256),
        displayName: z.string().trim().min(1).max(200),
      }),
    )
    .max(200),
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

  const parsed = syncRulesSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid rules payload" },
      { status: 400 },
    );
  }

  try {
    const ctx = await getSupabaseContext(request);
    if (!ctx) {
      return NextResponse.json({ synced: parsed.data.rules.length });
    }

    const { data: device, error: devErr } = await ctx.supabase
      .from("devices")
      .select("id, platform, status")
      .eq("id", parsed.data.deviceId)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (devErr) throw new Error(devErr.message);
    if (!device || device.status !== "active") {
      return NextResponse.json({ error: "Unknown or revoked device" }, { status: 403 });
    }

    // Replace active block rules for this device with the current mobile selection.
    assertSupabaseOk(
      await ctx.supabase
        .from("block_rules")
        .delete()
        .eq("user_id", ctx.userId)
        .eq("device_id", parsed.data.deviceId)
        .eq("rule_type", "block"),
    );

    if (parsed.data.rules.length > 0) {
      assertSupabaseOk(
        await ctx.supabase.from("block_rules").insert(
          parsed.data.rules.map((rule) => ({
            user_id: ctx.userId,
            device_id: parsed.data.deviceId,
            platform: device.platform,
            rule_type: "block",
            identifier: rule.identifier,
            display_name: rule.displayName,
            category: "entertainment",
            action: "overlay",
            is_enabled: true,
          })),
        ),
      );
    }

    return NextResponse.json({ synced: parsed.data.rules.length });
  } catch (error) {
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  }
}
