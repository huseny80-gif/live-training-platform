// POST /api/session/answer
// Records a participant's answer. Uses the existing submitAnswer() from session service
// which handles: token verification, scoring server-side, idempotency, and never
// exposes correctOptionId.

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { submitAnswer } from "@/lib/session/service";
import { checkAnswerRateLimit } from "@/lib/rate-limit";
import { hashToken } from "@/lib/session/guest-token";

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

  // Rate limit: keyed by sessionQuestionId + token hash — scoped to participant+question.
  // Prevents rapid-fire abuse without blocking legitimate single submissions or retries.
  const rlKey = `${sessionQuestionId}:${hashToken(token)}`;
  const rl = checkAnswerRateLimit(rlKey);
  if (!rl.allowed) {
    const retryAfterSec = Math.ceil(rl.retryAfterMs / 1000);
    return NextResponse.json(
      { error: "TOO_MANY_REQUESTS" },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
    );
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
