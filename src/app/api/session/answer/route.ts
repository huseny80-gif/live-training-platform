// POST /api/session/answer
// Records a participant's answer. Uses the existing submitAnswer() from session service
// which handles: token verification, scoring server-side, idempotency, and never
// exposes correctOptionId.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { submitAnswer } from "@/lib/session/service";

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("guest_token")?.value;

  if (!token) {
    return NextResponse.json({ error: "NOT_AUTHENTICATED" }, { status: 401 });
  }

  let body: { sessionQuestionId?: string; selectedOptionId?: string; timeTakenSeconds?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const { sessionQuestionId, selectedOptionId, timeTakenSeconds } = body;
  if (!sessionQuestionId || !selectedOptionId) {
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });
  }

  try {
    const result = await submitAnswer(token, sessionQuestionId, selectedOptionId, timeTakenSeconds);
    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      // Return only participant-safe fields — correctOptionId NEVER included
      isCorrect: result.answer.isCorrect,
      scoreAwarded: result.answer.scoreAwarded,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "SUBMIT_ERROR";
    const status =
      msg === "INVALID_TOKEN" ? 401 :
      msg === "QUESTION_NOT_LIVE" ? 409 :
      msg === "PARTICIPANT_NOT_IN_SESSION" ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
