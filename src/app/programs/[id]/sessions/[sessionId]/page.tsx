import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import {
  getSessionDetails,
  startLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  endLiveSession,
  showLiveQuestion,
  closeLiveQuestion,
  showQuestionResults,
  getNextQuestion,
  getSessionLeaderboard,
  getSessionQuestionsAction,
} from "@/app/actions/sessions";

export const dynamic = "force-dynamic";

const STATUS_COLOR: Record<string, string> = {
  DRAFT:  "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-orange-100 text-orange-800",
  ENDED:  "bg-gray-100 text-gray-600",
};

const SQ_STATUS_COLOR: Record<string, string> = {
  DRAFT:   "bg-gray-100 text-gray-500",
  READY:   "bg-blue-100 text-blue-700",
  LIVE:    "bg-green-100 text-green-700",
  CLOSED:  "bg-orange-100 text-orange-700",
  RESULTS: "bg-purple-100 text-purple-700",
};

export default async function InstructorSessionPage({
  params,
}: {
  params: Promise<{ id: string; sessionId: string }>;
}) {
  const { id, sessionId } = await params;

  const authSession = await auth();
  if (!authSession?.user?.id) redirect("/login");

  let session;
  try {
    session = await getSessionDetails(sessionId);
  } catch {
    notFound();
  }

  if (session.programId !== id) notFound();

  const questions = await getSessionQuestionsAction(sessionId);

  const currentSQ = session.currentQuestionId
    ? questions.find((q) => q.id === session.currentQuestionId) ?? null
    : null;

  const leaderboard =
    session.status === "ENDED" ? await getSessionLeaderboard(sessionId) : null;

  const nextQ =
    session.status === "ACTIVE" && (!currentSQ || currentSQ.status === "CLOSED" || currentSQ.status === "RESULTS")
      ? await getNextQuestion(sessionId)
      : null;

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/programs/${id}`} className="text-sm text-gray-500 hover:text-gray-800">
            ← Program
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="font-bold truncate">{session.title}</h1>
        </div>

        {/* Session info */}
        <div className="bg-white rounded-2xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${STATUS_COLOR[session.status]}`}>
              {session.status}
            </span>
            <span className="text-sm text-gray-500">
              {session._count.participants} participant{session._count.participants !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Session code — shown to participants */}
          <div className="bg-gray-50 rounded-xl p-4 text-center">
            <p className="text-xs text-gray-500 mb-1">Participants join at <strong>/join</strong> with code:</p>
            <p className="text-4xl font-mono font-bold tracking-widest text-blue-700">{session.sessionCode}</p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap gap-2">
            {session.status === "DRAFT" && (
              <form action={async () => {
                "use server";
                await startLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  ▶ Start Session
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && nextQ && (
              <form action={async () => {
                "use server";
                await showLiveQuestion(sessionId, nextQ.id);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  ▶ Show Q{nextQ.questionOrder}
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && currentSQ?.status === "LIVE" && (
              <form action={async () => {
                "use server";
                await closeLiveQuestion(sessionId, currentSQ.id);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
                  ■ Close Question
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && currentSQ?.status === "CLOSED" && (
              <form action={async () => {
                "use server";
                await showQuestionResults(sessionId, currentSQ.id);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
                  Show Results
                </button>
              </form>
            )}

            {session.status === "ACTIVE" && (
              <form action={async () => {
                "use server";
                await pauseLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  ⏸ Pause
                </button>
              </form>
            )}

            {session.status === "PAUSED" && (
              <form action={async () => {
                "use server";
                await resumeLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
                  ▶ Resume
                </button>
              </form>
            )}

            {(session.status === "ACTIVE" || session.status === "PAUSED") && (
              <form action={async () => {
                "use server";
                await endLiveSession(sessionId);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100">
                  End Session
                </button>
              </form>
            )}

            {/* Manual refresh */}
            <form action={async () => {
              "use server";
              redirect(`/programs/${id}/sessions/${sessionId}`);
            }}>
              <button type="submit" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                ↻ Refresh
              </button>
            </form>
          </div>
        </div>

        {/* Current question */}
        {currentSQ && (
          <div className="bg-white rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Current Question — Q{currentSQ.questionOrder}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${SQ_STATUS_COLOR[currentSQ.status]}`}>
                {currentSQ.status}
              </span>
            </div>
            <p className="text-gray-700">{currentSQ.question.questionText}</p>
          </div>
        )}

        {/* All questions list */}
        <div className="bg-white rounded-2xl border p-6">
          <h2 className="font-semibold mb-4">Questions ({questions.length})</h2>
          <div className="space-y-2">
            {questions.map((sq) => (
              <div key={sq.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                <span className="font-mono text-gray-400 w-8">Q{sq.questionOrder}</span>
                <span className="flex-1 text-gray-700 truncate mx-2">{sq.question.questionText}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${SQ_STATUS_COLOR[sq.status]}`}>
                  {sq.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Analytics link when session ended */}
        {session.status === "ENDED" && (
          <div className="bg-white rounded-2xl border p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">Session Ended</p>
              <p className="text-sm text-gray-500">View detailed analytics, charts, and export to Excel.</p>
            </div>
            <Link
              href={`/programs/${id}/sessions/${sessionId}/results`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
            >
              📊 View Analytics
            </Link>
          </div>
        )}

        {/* Leaderboard (only when session ended) */}
        {leaderboard && leaderboard.length > 0 && (
          <div className="bg-white rounded-2xl border p-6">
            <h2 className="font-semibold mb-4">Final Leaderboard</h2>
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div key={entry.participantId} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                  <span className="w-8 font-mono font-bold text-gray-400">#{entry.rank}</span>
                  <span className="flex-1 font-medium">{entry.displayName}</span>
                  <span className="text-gray-500 text-xs mr-3">{entry.correctCount}/{entry.answersCount} correct</span>
                  <span className="font-bold text-blue-700">{entry.totalScore} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
