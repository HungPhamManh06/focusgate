import { NextResponse } from "next/server";
import { z } from "zod";
import { friendlyDbError } from "@/lib/data/errors";
import {
  cancelFocusSession,
  completeFocusSession,
  getActiveSession,
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
} from "@/lib/data/focus";
import { isAuthorizedApiRequest } from "@/lib/supabase/api-auth";

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    plannedMinutes: z.number().int().min(5).max(180).default(25),
    taskId: z.string().uuid().nullable().optional(),
    mode: z
      .enum(["pomodoro_25_5", "pomodoro_50_10", "custom", "open_ended"])
      .default("pomodoro_25_5"),
  }),
  z.object({
    action: z.literal("pause"),
    sessionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("resume"),
    sessionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("complete"),
    sessionId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("cancel"),
    sessionId: z.string().uuid(),
  }),
]);

function computeSessionTiming(session: {
  startedAt: string;
  plannedMinutes: number;
  status: string;
  pausedAt?: string | null;
  pausedSeconds?: number;
}): { elapsedSeconds: number; remainingSeconds: number } {
  const startedMs = new Date(session.startedAt).getTime();
  const refMs =
    session.status === "paused" && session.pausedAt
      ? new Date(session.pausedAt).getTime()
      : Date.now();
  const elapsedSeconds = Math.max(
    0,
    Math.floor((refMs - startedMs) / 1000) - Math.max(0, session.pausedSeconds ?? 0),
  );
  const remainingSeconds = Math.max(0, session.plannedMinutes * 60 - elapsedSeconds);
  return { elapsedSeconds, remainingSeconds };
}

export async function GET(request: Request) {
  if (!(await isAuthorizedApiRequest(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  try {
    const session = await getActiveSession(request);
    if (!session) {
      return NextResponse.json({ active: false, session: null }, { headers: NO_STORE_HEADERS });
    }
    const { elapsedSeconds, remainingSeconds } = computeSessionTiming(session);
    const endsAt = new Date(Date.now() + remainingSeconds * 1000).toISOString();
    return NextResponse.json(
      {
        active: true,
        session: {
          ...session,
          elapsedSeconds,
          remainingSeconds,
          endsAt,
        },
      },
      { headers: NO_STORE_HEADERS },
    );
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
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid payload" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const cmd = parsed.data;
    if (cmd.action === "start") {
      await startFocusSession({
        taskId: cmd.taskId ?? null,
        mode: cmd.mode,
        plannedMinutes: cmd.plannedMinutes,
      }, request);
    } else if (cmd.action === "pause") {
      await pauseFocusSession(cmd.sessionId, request);
    } else if (cmd.action === "resume") {
      await resumeFocusSession(cmd.sessionId, request);
    } else if (cmd.action === "complete") {
      await completeFocusSession(cmd.sessionId, request);
    } else if (cmd.action === "cancel") {
      await cancelFocusSession(cmd.sessionId, request);
    }

    const session = await getActiveSession(request);
    if (!session) {
      return NextResponse.json({ active: false, session: null }, { headers: NO_STORE_HEADERS });
    }
    const { elapsedSeconds, remainingSeconds } = computeSessionTiming(session);
    const endsAt = new Date(Date.now() + remainingSeconds * 1000).toISOString();
    return NextResponse.json(
      {
        active: true,
        session: { ...session, elapsedSeconds, remainingSeconds, endsAt },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    return NextResponse.json(
      { error: friendlyDbError(error) },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
}
