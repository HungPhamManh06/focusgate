import { NextResponse } from "next/server";
import { createAgentTask } from "@/lib/data/agent-tasks";
import { friendlyDbError } from "@/lib/data/errors";
import { agentCreateTaskSchema } from "@/lib/domain/agent-mobile-schemas";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

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

  const parsed = agentCreateTaskSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid task payload" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const result = await createAgentTask(parsed.data, request);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return NextResponse.json(
      { error: friendlyDbError(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
