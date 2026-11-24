import { NextResponse } from "next/server";
import { getAgentTodayPlan } from "@/lib/data/agent-plan";
import { buildAgentTodayPlan } from "@/lib/data/agent-plan-build";
import { friendlyDbError } from "@/lib/data/errors";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  try {
    const snapshot = await getAgentTodayPlan(request);
    return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
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

  try {
    const snapshot = await buildAgentTodayPlan(request);
    return NextResponse.json(snapshot, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyDbError(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
