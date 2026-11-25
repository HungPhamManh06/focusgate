import { NextResponse } from "next/server";
import { z } from "zod";
import { friendlyDbError } from "@/lib/data/errors";
import {
  acceptPartnerInvite,
  createPartnerInvite,
  getPartnerOverview,
  sendPartnerCheer,
} from "@/lib/data/v4-ecosystem";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const partnerActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("invite") }),
  z.object({ action: z.literal("accept"), code: z.string().min(4).max(16) }),
  z.object({
    action: z.literal("cheer"),
    partnerUserId: z.string().uuid(),
    message: z.string().max(160).default("Keep going!"),
  }),
]);

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  try {
    const overview = await getPartnerOverview(request);
    return NextResponse.json(overview, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyDbError(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const parsed = partnerActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const cmd = parsed.data;
    if (cmd.action === "invite") {
      const code = await createPartnerInvite(request);
      return NextResponse.json({ inviteCode: code }, { headers: NO_STORE_HEADERS });
    }
    if (cmd.action === "accept") {
      await acceptPartnerInvite(cmd.code, request);
      const overview = await getPartnerOverview(request);
      return NextResponse.json(overview, { headers: NO_STORE_HEADERS });
    }
    await sendPartnerCheer(cmd.partnerUserId, cmd.message, request);
    return NextResponse.json({ sent: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyDbError(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
