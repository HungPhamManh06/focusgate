import { NextResponse } from "next/server";
import { getAgentTodayPlan } from "@/lib/data/agent-plan";
import { friendlyDbError } from "@/lib/data/errors";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await getAgentTodayPlan(request);
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 400 });
  }
}
