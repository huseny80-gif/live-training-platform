// SessionService — all DB operations for live sessions.
// Correct answers, scoring, and leaderboard are computed here (server-side only).
// correctOptionId is NEVER returned to participants.

import { prisma } from "@/lib/prisma";
import { issueGuestToken, verifyGuestToken, hashToken } from "./guest-token";
import { randomBytes } from "crypto";
import { getIO } from "@/lib/realtime/io-singleton";
import {
  emitSessionStarted,
  emitSessionPaused,
  emitSessionResumed,
  emitSessionEnded,
  emitQuestionStarted,
  emitQuestionChanged,
  emitQuestionLocked,
} from "@/lib/realtime/socket-server";

const DEFAULT_SCORE_CORRECT = 10;

function parseScoringConfig(raw: unknown): { scoreCorrect: number; passingScore: number | null } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { scoreCorrect: DEFAULT_SCORE_CORRECT, passingScore: null };
  }
  const cfg = raw as Record<string, unknown>;

  const v = cfg["scoreCorrect"];
  const scoreCorrect =
    typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 10000
      ? v
      : DEFAULT_SCORE_CORRECT;

  const ps = cfg["passingScore"];
  // null = no automatic issuance; number 0–100 = percentage threshold
  const passingScore =
    typeof ps === "number" && Number.isFinite(ps) && ps >= 0 && ps <= 100
      ? ps
      : null;

  return { scoreCorrect, passingScore };
}

const VERIFICATION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 unambiguous chars

function generateVerificationCode(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes)
    .map((b) => VERIFICATION_CODE_CHARS[b % VERIFICATION_CODE_CHARS.length])
    .join("")
    .slice(0, 8);
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function writeAudit(opts: {
  entityType: string;
  entityId: string;
  action: string;
  actorType: "INSTRUCTOR" | "PARTICIPANT" | "SYSTEM";
  actorId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        entityType: opts.entityType,
        entityId: opts.entityId,
        action: opts.action,
        actorType: opts.actorType,
        actorId: opts.actorId ?? null,
        // Prisma InputJsonValue requires explicit cast from Record<string, unknown>
        metadata: (opts.metadata ?? {}) as Parameters<typeof prisma.auditLog.create>[0]["data"]["metadata"],
      },
    });
  } catch (err) {
    // Audit failure must never crash the main flow.
    // Log safe fields only — no secrets, no tokens, no personal data.
    process.stderr.write(
      `[AuditLog] write failed: action=${opts.action} entity=${opts.entityType}:${opts.entityId} err=${err instanceof Error ? err.message : String(err)}\n`,
    );
  }
}

// ── Session creation ──────────────────────────────────────────────────────────

export async function createSession(
  programId: string,
  instructorId: string,
  dayNumber: number,
  title?: string
) {
  // Verify ownership
  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId },
  });
  if (!program) throw new Error("PROGRAM_NOT_FOUND");

  // Verify questions exist for the day
  const day = await prisma.trainingDay.findFirst({
    where: { programId, dayNumber },
    include: { questions: { where: { status: { in: ["APPROVED", "DRAFT"] } } } },
  });
  if (!day || day.questions.length === 0) throw new Error("NO_QUESTIONS_FOR_DAY");

  // Generate unique session code
  const sessionCode = await generateUniqueCode();

  const session = await prisma.liveSession.create({
    data: {
      programId,
      instructorId,
      sessionCode,
      dayNumber,
      title: title ?? `${program.title} — Day ${dayNumber}`,
      status: "DRAFT",
    },
  });

  // Create SessionQuestion rows (ordered)
  for (const q of day.questions.sort((a, b) => a.questionOrder - b.questionOrder)) {
    await prisma.sessionQuestion.create({
      data: {
        sessionId: session.id,
        questionId: q.id,
        questionOrder: q.questionOrder,
        status: "DRAFT",
      },
    });
  }

  await writeAudit({
    entityType: "LiveSession",
    entityId: session.id,
    action: "SESSION_CREATED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: { sessionCode, dayNumber, programId },
  });

  return session;
}

async function generateUniqueCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomBytes(3).toString("hex").toUpperCase(); // e.g. "A3F2B1"
    const existing = await prisma.liveSession.findUnique({ where: { sessionCode: code } });
    if (!existing) return code;
  }
  throw new Error("FAILED_TO_GENERATE_CODE");
}

// ── Participant join ──────────────────────────────────────────────────────────

export async function participantJoin(sessionCode: string, displayName: string) {
  const name = displayName.trim();
  if (!name || name.length < 2 || name.length > 50) throw new Error("INVALID_DISPLAY_NAME");

  const session = await prisma.liveSession.findUnique({ where: { sessionCode } });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.status === "ENDED") throw new Error("SESSION_ENDED");
  if (session.status === "DRAFT") throw new Error("SESSION_NOT_STARTED");

  // Check join deadline
  if (session.joinDeadlineAt && new Date() > session.joinDeadlineAt) {
    throw new Error("JOIN_DEADLINE_PASSED");
  }

  // Issue guest token with temp participantId (will be updated after DB create)
  const tempId = randomBytes(16).toString("hex");
  const tempToken = issueGuestToken({ participantId: tempId, sessionId: session.id, displayName: name });
  const tokenHash = hashToken(tempToken);

  const participant = await prisma.sessionParticipant.create({
    data: {
      sessionId: session.id,
      displayName: name,
      joinTokenHash: tokenHash,
      status: "JOINED",
      lastSeenAt: new Date(),
    },
  });

  // Issue final token with real participantId
  const token = issueGuestToken({ participantId: participant.id, sessionId: session.id, displayName: name });
  const finalHash = hashToken(token);
  await prisma.sessionParticipant.update({
    where: { id: participant.id },
    data: { joinTokenHash: finalHash },
  });

  await writeAudit({
    entityType: "SessionParticipant",
    entityId: participant.id,
    action: "PARTICIPANT_JOIN",
    actorType: "PARTICIPANT",
    actorId: participant.id,
    metadata: { sessionId: session.id, sessionCode, displayName: name },
  });

  return { token, participantId: participant.id, sessionId: session.id };
}

// ── Session lifecycle ─────────────────────────────────────────────────────────

export async function startSession(sessionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);
  if (session.status !== "DRAFT") throw new Error("INVALID_STATE");

  const updated = await prisma.liveSession.update({
    where: { id: sessionId },
    data: { status: "ACTIVE", startedAt: new Date() },
  });
  await writeAudit({
    entityType: "LiveSession",
    entityId: sessionId,
    action: "SESSION_STARTED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: { sessionCode: updated.sessionCode },
  });
  const io = getIO();
  if (io) emitSessionStarted(io, { sessionCode: updated.sessionCode, sessionId, timestamp: new Date().toISOString() });
  return updated;
}

export async function pauseSession(sessionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);
  if (session.status !== "ACTIVE") throw new Error("INVALID_STATE");
  const updated = await prisma.liveSession.update({ where: { id: sessionId }, data: { status: "PAUSED" } });
  await writeAudit({
    entityType: "LiveSession",
    entityId: sessionId,
    action: "SESSION_PAUSED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
  });
  const io = getIO();
  if (io) emitSessionPaused(io, { sessionCode: updated.sessionCode, sessionId, timestamp: new Date().toISOString() });
  return updated;
}

export async function resumeSession(sessionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);
  if (session.status !== "PAUSED") throw new Error("INVALID_STATE");
  const updated = await prisma.liveSession.update({ where: { id: sessionId }, data: { status: "ACTIVE" } });
  await writeAudit({
    entityType: "LiveSession",
    entityId: sessionId,
    action: "SESSION_RESUMED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
  });
  const io = getIO();
  if (io) emitSessionResumed(io, { sessionCode: updated.sessionCode, sessionId, timestamp: new Date().toISOString() });
  return updated;
}

export async function endSession(sessionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);
  const session = await prisma.liveSession.update({
    where: { id: sessionId },
    data: { status: "ENDED", endedAt: new Date() },
  });
  await computeSessionResult(sessionId);
  await issueCertificates(sessionId);
  await writeAudit({
    entityType: "LiveSession",
    entityId: sessionId,
    action: "SESSION_ENDED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: { endedAt: session.endedAt?.toISOString() },
  });
  const io = getIO();
  if (io) {
    // Leaderboard is populated by computeSessionResult(); fetch it now so
    // participants receive final rankings via the SESSION_ENDED event.
    const leaderboard = await getLeaderboard(sessionId);
    emitSessionEnded(io, { sessionCode: session.sessionCode, sessionId, endedAt: new Date().toISOString(), leaderboard });
  }
  return session;
}

// ── Question lifecycle ────────────────────────────────────────────────────────

export async function showQuestion(sessionId: string, sessionQuestionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);

  const sq = await prisma.sessionQuestion.findFirst({
    where: { id: sessionQuestionId, sessionId },
  });
  if (!sq) throw new Error("QUESTION_NOT_IN_SESSION");
  if (sq.status !== "DRAFT" && sq.status !== "READY") throw new Error("INVALID_QUESTION_STATE");

  const updated = await prisma.sessionQuestion.update({
    where: { id: sessionQuestionId },
    data: { status: "LIVE", startedAt: new Date() },
  });
  await prisma.liveSession.update({
    where: { id: sessionId },
    data: { currentQuestionId: sessionQuestionId },
  });

  await writeAudit({
    entityType: "SessionQuestion",
    entityId: sessionQuestionId,
    action: "QUESTION_STARTED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: { sessionId, questionOrder: sq.questionOrder },
  });
  const io = getIO();
  if (io) emitQuestionStarted(io, {
    sessionCode: session.sessionCode,
    sessionId,
    questionId: sessionQuestionId,
    questionIndex: sq.questionOrder,
    timestamp: new Date().toISOString(),
  });
  return updated;
}

export async function closeQuestion(sessionId: string, sessionQuestionId: string, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);

  const sq = await prisma.sessionQuestion.findFirst({
    where: { id: sessionQuestionId, sessionId },
  });
  if (!sq) throw new Error("QUESTION_NOT_IN_SESSION");
  if (sq.status !== "LIVE") throw new Error("QUESTION_NOT_LIVE");

  const updated = await prisma.sessionQuestion.update({
    where: { id: sessionQuestionId },
    data: { status: "CLOSED", closedAt: new Date() },
  });
  await writeAudit({
    entityType: "SessionQuestion",
    entityId: sessionQuestionId,
    action: "QUESTION_LOCKED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: { sessionId, questionOrder: sq.questionOrder },
  });
  const io = getIO();
  if (io) emitQuestionLocked(io, {
    sessionCode: session.sessionCode,
    sessionId,
    questionId: sessionQuestionId,
    questionIndex: sq.questionOrder,
    timestamp: new Date().toISOString(),
  });
  return updated;
}

export async function showResults(sessionId: string, sessionQuestionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  await prisma.sessionQuestion.update({
    where: { id: sessionQuestionId },
    data: { status: "RESULTS", resultsShownAt: new Date() },
  });

  await writeAudit({
    entityType: "SessionQuestion",
    entityId: sessionQuestionId,
    action: "SHOW_RESULTS",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: { sessionId },
  });

  return buildQuestionResult(sessionQuestionId);
}

export async function gotoQuestion(sessionId: string, questionOrder: number, instructorId: string) {
  const session = await requireOwnership(sessionId, instructorId);

  const sq = await prisma.sessionQuestion.findFirst({
    where: { sessionId, questionOrder },
    include: { question: { select: { questionText: true } } },
  });
  if (!sq) throw new Error("QUESTION_NOT_FOUND");

  const updated = await prisma.sessionQuestion.update({
    where: { id: sq.id },
    data: { status: "LIVE", startedAt: new Date() },
  });
  await prisma.liveSession.update({
    where: { id: sessionId },
    data: { currentQuestionId: sq.id },
  });

  const io = getIO();
  if (io) emitQuestionChanged(io, {
    sessionCode: session.sessionCode,
    sessionQuestionId: sq.id,
    questionOrder: sq.questionOrder,
    questionText: sq.question.questionText,
    timeLimitSeconds: sq.timeLimitSeconds ?? null,
  });
  return updated;
}

export async function nextQuestion(sessionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  const session = await prisma.liveSession.findUnique({ where: { id: sessionId } });
  if (!session) throw new Error("SESSION_NOT_FOUND");

  // Find next DRAFT/READY question by order
  const currentSQ = session.currentQuestionId
    ? await prisma.sessionQuestion.findUnique({ where: { id: session.currentQuestionId } })
    : null;
  const currentOrder = currentSQ?.questionOrder ?? 0;

  const next = await prisma.sessionQuestion.findFirst({
    where: { sessionId, questionOrder: { gt: currentOrder }, status: { in: ["DRAFT", "READY"] } },
    orderBy: { questionOrder: "asc" },
  });

  return next ?? null;
}

// ── Answer submission (transaction-safe, idempotent) ─────────────────────────

export async function submitAnswer(
  participantToken: string,
  sessionQuestionId: string,
  selectedOptionId: string,
  timeTakenSeconds?: number
) {
  // Verify guest token — prevents spoofed participantId from client
  let tokenPayload: { participantId: string; sessionId: string };
  try {
    tokenPayload = verifyGuestToken(participantToken);
  } catch {
    throw new Error("INVALID_TOKEN");
  }

  const { participantId, sessionId } = tokenPayload;

  // Atomic transaction: prevents concurrent duplicate submissions
  const result = await prisma.$transaction(async (tx) => {
    // Verify SessionQuestion is LIVE
    const sq = await tx.sessionQuestion.findFirst({
      where: { id: sessionQuestionId, sessionId },
      include: {
        question: {
          include: { options: true },
        },
        session: { select: { scoringConfig: true } },
      },
    });
    if (!sq) throw new Error("QUESTION_NOT_FOUND");
    if (sq.status !== "LIVE") throw new Error("QUESTION_NOT_LIVE");

    // Verify participant belongs to this session
    const participant = await tx.sessionParticipant.findFirst({
      where: { id: participantId, sessionId },
    });
    if (!participant) throw new Error("PARTICIPANT_NOT_IN_SESSION");

    // Verify selected option belongs to the question
    const option = sq.question.options.find((o) => o.id === selectedOptionId);
    if (!option) throw new Error("INVALID_OPTION");

    // Idempotency check: final answer already recorded for this participant+question
    const existing = await tx.participantAnswer.findFirst({
      where: { sessionQuestionId, participantId, isFinal: true },
    });
    if (existing) return { duplicate: true, answer: existing };

    // Score server-side — scoreCorrect read from session's scoringConfig, default 10
    const { scoreCorrect } = parseScoringConfig(sq.session.scoringConfig);
    const isCorrect = sq.question.correctOptionId === selectedOptionId;
    const scoreAwarded = isCorrect ? scoreCorrect : 0;

    // Insert answer (partial unique index enforces uniqueness at DB level)
    const answer = await tx.participantAnswer.create({
      data: {
        sessionId,
        sessionQuestionId,
        participantId,
        selectedOptionId,
        isCorrect,
        scoreAwarded,
        isFinal: true,
        timeTakenSeconds: timeTakenSeconds ?? null,
      },
    });

    // Update participant running totals
    await tx.sessionParticipant.update({
      where: { id: participantId },
      data: {
        totalScore: { increment: scoreAwarded },
        answersCount: { increment: 1 },
        correctCount: { increment: isCorrect ? 1 : 0 },
        lastSeenAt: new Date(),
      },
    });

    return { duplicate: false, answer };
  });

  // Write audit outside the transaction — never blocks the main flow
  if (!result.duplicate) {
    await writeAudit({
      entityType: "ParticipantAnswer",
      entityId: result.answer.id,
      action: "SUBMIT_ANSWER",
      actorType: "PARTICIPANT",
      actorId: participantId,
      metadata: {
        sessionId,
        sessionQuestionId,
        isCorrect: result.answer.isCorrect,
        scoreAwarded: Number(result.answer.scoreAwarded),
      },
    });
  }

  return result;
}

// ── Leaderboard ───────────────────────────────────────────────────────────────

export async function getLeaderboard(sessionId: string) {
  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId },
    orderBy: [{ totalScore: "desc" }, { correctCount: "desc" }, { joinedAt: "asc" }],
    select: {
      id: true,
      displayName: true,
      totalScore: true,
      rank: true,
      correctCount: true,
      answersCount: true,
    },
  });

  return participants.map((p, i) => ({
    participantId: p.id,
    displayName: p.displayName,
    totalScore: Number(p.totalScore),
    rank: i + 1,
    correctCount: p.correctCount,
    answersCount: p.answersCount,
  }));
}

// ── Safe question payload (no correct answer) ─────────────────────────────────

export async function getLiveQuestionPayload(sessionQuestionId: string) {
  const sq = await prisma.sessionQuestion.findUnique({
    where: { id: sessionQuestionId },
    include: {
      question: {
        include: {
          options: { orderBy: { displayOrder: "asc" } },
        },
      },
    },
  });
  if (!sq) throw new Error("NOT_FOUND");

  return {
    sessionQuestionId: sq.id,
    questionId: sq.questionId,
    questionText: sq.question.questionText,
    options: sq.question.options.map((o) => ({
      id: o.id,
      optionLabel: o.optionLabel,
      optionText: o.optionText,
      displayOrder: o.displayOrder,
      // correctOptionId deliberately NOT included
    })),
    questionOrder: sq.questionOrder,
    timeLimitSeconds: sq.timeLimitSeconds,
    startedAt: sq.startedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Question result (correct answer revealed — instructor + post-close only) ──

export async function buildQuestionResult(sessionQuestionId: string) {
  const sq = await prisma.sessionQuestion.findUnique({
    where: { id: sessionQuestionId },
    include: {
      question: true,
      answers: { where: { isFinal: true } },
    },
  });
  if (!sq) throw new Error("NOT_FOUND");

  const answerCounts: Record<string, number> = {};
  for (const ans of sq.answers) {
    answerCounts[ans.selectedOptionId] = (answerCounts[ans.selectedOptionId] ?? 0) + 1;
  }

  return {
    sessionQuestionId: sq.id,
    correctOptionId: sq.question.correctOptionId ?? "",
    answerCounts,
    correctCount: sq.answers.filter((a) => a.isCorrect).length,
    totalAnswers: sq.answers.length,
  };
}

// ── Session result computation ────────────────────────────────────────────────

async function computeSessionResult(sessionId: string) {
  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId },
    select: { id: true, totalScore: true, correctCount: true, answersCount: true },
  });

  if (participants.length === 0) return;

  const scores = participants.map((p) => Number(p.totalScore));
  const totalAnswers = participants.reduce((s, p) => s + p.answersCount, 0);
  const totalCorrect = participants.reduce((s, p) => s + p.correctCount, 0);
  const sessionQuestions = await prisma.sessionQuestion.count({ where: { sessionId } });

  await prisma.sessionResult.upsert({
    where: { sessionId },
    create: {
      sessionId,
      totalParticipants: participants.length,
      totalQuestions: sessionQuestions,
      totalAnswers,
      totalCorrect,
      correctRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      highestScore: Math.max(...scores),
      computedAt: new Date(),
    },
    update: {
      totalParticipants: participants.length,
      totalAnswers,
      totalCorrect,
      correctRate: totalAnswers > 0 ? totalCorrect / totalAnswers : 0,
      averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
      highestScore: Math.max(...scores),
      computedAt: new Date(),
    },
  });

  // Update ranks on participants
  const sorted = [...participants].sort((a, b) => Number(b.totalScore) - Number(a.totalScore));
  for (let i = 0; i < sorted.length; i++) {
    await prisma.sessionParticipant.update({
      where: { id: sorted[i].id },
      data: { rank: i + 1 },
    });
  }
}

// ── Certificate issuance ──────────────────────────────────────────────────────

export async function issueCertificates(
  sessionId: string,
): Promise<{ issued: number; skipped: number }> {
  const session = await prisma.liveSession.findUnique({
    where: { id: sessionId },
    include: { program: { select: { title: true } } },
  });
  if (!session) return { issued: 0, skipped: 0 };

  const { passingScore } = parseScoringConfig(session.scoringConfig);
  if (passingScore === null) return { issued: 0, skipped: 0 };

  const participants = await prisma.sessionParticipant.findMany({
    where: { sessionId },
    select: { id: true, displayName: true, totalScore: true, correctCount: true, answersCount: true, rank: true },
  });
  if (participants.length === 0) return { issued: 0, skipped: 0 };

  const questionsTotal = await prisma.sessionQuestion.count({ where: { sessionId } });

  let issued = 0;
  let skipped = 0;

  for (const p of participants) {
    const rate = questionsTotal > 0 ? (p.correctCount / questionsTotal) * 100 : 0;
    if (rate < passingScore) { skipped++; continue; }

    // Generate certificateNumber via DB sequence
    const seqRows = await prisma.$queryRaw<[{ nextval: bigint }]>`
      SELECT nextval('certificate_number_seq')
    `;
    const year = new Date().getFullYear();
    // seqRows[0].nextval is bigint — convert via toString() for formatting
    const seqNum = seqRows[0].nextval.toString();
    const certNum = `CERT-${year}-${seqNum.padStart(6, "0")}`;

    // Generate verificationCode with collision retry
    let verificationCode = generateVerificationCode();
    let attempts = 0;
    while (attempts < 5) {
      const conflict = await prisma.certificate.findUnique({ where: { verificationCode } });
      if (!conflict) break;
      verificationCode = generateVerificationCode();
      attempts++;
    }

    const cert = await prisma.certificate.upsert({
      where: { sessionId_participantId: { sessionId, participantId: p.id } },
      create: {
        sessionId,
        participantId: p.id,
        programId: session.programId,
        certificateNumber: certNum,
        verificationCode,
        displayName: p.displayName,
        programTitle: session.program.title,
        dayNumber: session.dayNumber,
        totalScore: p.totalScore,
        correctCount: p.correctCount,
        questionsTotal,
        rank: p.rank ?? null,
        status: "ISSUED",
        issuedAt: new Date(),
      },
      update: {},
    });
    // Audit after commit — fire-and-forget, must not roll back certificate issuance
    void writeAudit({
      entityType: "Certificate",
      entityId: cert.id,
      action: "CERTIFICATE_ISSUED",
      actorType: "SYSTEM",
      metadata: {
        certificateId: cert.id,
        certificateNumber: cert.certificateNumber,
        sessionId,
        participantId: p.id,
      },
    }).catch((e: unknown) =>
      process.stderr.write(`[service] CERTIFICATE_ISSUED audit failed: ${e instanceof Error ? e.message : e}\n`)
    );
    issued++;
  }

  return { issued, skipped };
}

export async function getCertificateForParticipant(token: string, sessionCode: string) {
  const payload = verifyGuestToken(token);
  if (!payload) throw new Error("INVALID_TOKEN");

  const session = await prisma.liveSession.findUnique({ where: { sessionCode } });
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (session.id !== payload.sessionId) throw new Error("SESSION_MISMATCH");

  const cert = await prisma.certificate.findUnique({
    where: { sessionId_participantId: { sessionId: session.id, participantId: payload.participantId } },
  });
  if (!cert) throw new Error("CERTIFICATE_NOT_FOUND");
  if (cert.status === "REVOKED") throw new Error("CERTIFICATE_REVOKED");

  return {
    certificateNumber: cert.certificateNumber,
    verificationCode: cert.verificationCode,
    displayName: cert.displayName,
    programTitle: cert.programTitle,
    dayNumber: cert.dayNumber,
    totalScore: Number(cert.totalScore),
    correctCount: cert.correctCount,
    questionsTotal: cert.questionsTotal,
    rank: cert.rank,
    issuedAt: cert.issuedAt.toISOString(),
  };
}

export async function listSessionCertificates(sessionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);
  return prisma.certificate.findMany({
    where: { sessionId },
    orderBy: [{ rank: "asc" }, { issuedAt: "asc" }],
    select: {
      id: true,
      certificateNumber: true,
      verificationCode: true,
      displayName: true,
      totalScore: true,
      correctCount: true,
      questionsTotal: true,
      rank: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
    },
  });
}

export async function revokeCertificate(certId: string, instructorId: string) {
  const cert = await prisma.certificate.findUnique({
    where: { id: certId },
    include: { session: { select: { instructorId: true } } },
  });
  if (!cert) throw new Error("CERTIFICATE_NOT_FOUND");
  if (cert.session.instructorId !== instructorId) throw new Error("UNAUTHORIZED");
  if (cert.status === "REVOKED") throw new Error("ALREADY_REVOKED");

  const revoked = await prisma.certificate.update({
    where: { id: certId },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  // Audit after commit — fire-and-forget
  void writeAudit({
    entityType: "Certificate",
    entityId: certId,
    action: "CERTIFICATE_REVOKED",
    actorType: "INSTRUCTOR",
    actorId: instructorId,
    metadata: {
      certificateId: certId,
      revokedBy: instructorId,
      timestamp: new Date().toISOString(),
    },
  }).catch((e: unknown) =>
    process.stderr.write(`[service] CERTIFICATE_REVOKED audit failed: ${e instanceof Error ? e.message : e}\n`)
  );
  return revoked;
}

// ── Session reset ─────────────────────────────────────────────────────────────

export async function resetSession(sessionId: string, instructorId: string) {
  await requireOwnership(sessionId, instructorId);

  await prisma.$transaction([
    // Delete participant answers
    prisma.participantAnswer.deleteMany({ where: { sessionId } }),
    // Delete participant day results
    prisma.participantDayResult.deleteMany({ where: { sessionId } }),
    // Delete daily result
    prisma.dailyResult.deleteMany({ where: { sessionId } }),
    // Delete session result
    prisma.sessionResult.deleteMany({ where: { sessionId } }),
    // Delete participants
    prisma.sessionParticipant.deleteMany({ where: { sessionId } }),
    // Reset session questions to DRAFT
    prisma.sessionQuestion.updateMany({
      where: { sessionId },
      data: { status: "DRAFT", startedAt: null, closedAt: null, resultsShownAt: null },
    }),
    // Reset session itself to DRAFT
    prisma.liveSession.update({
      where: { id: sessionId },
      data: {
        status: "DRAFT",
        currentQuestionId: null,
        startedAt: null,
        endedAt: null,
      },
    }),
  ]);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function requireOwnership(sessionId: string, instructorId: string) {
  const session = await prisma.liveSession.findFirst({
    where: { id: sessionId, instructorId },
  });
  if (!session) throw new Error("SESSION_NOT_FOUND_OR_UNAUTHORIZED");
  return session;
}

export async function requireAdmin(instructorId: string): Promise<void> {
  const instructor = await prisma.instructor.findUnique({
    where: { id: instructorId },
    select: { role: true },
  });
  if (!instructor || instructor.role !== "ADMIN") throw new Error("UNAUTHORIZED");
}

export async function getSessionByCode(code: string) {
  return prisma.liveSession.findUnique({ where: { sessionCode: code } });
}

export async function getSessionQuestions(sessionId: string) {
  return prisma.sessionQuestion.findMany({
    where: { sessionId },
    orderBy: { questionOrder: "asc" },
    include: { question: { select: { questionText: true, questionOrder: true } } },
  });
}
