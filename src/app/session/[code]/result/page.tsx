import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getParticipantResult } from "@/app/actions/sessions";

export const dynamic = "force-dynamic";

export default async function ParticipantResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;

  const cookieStore = await cookies();
  const token = cookieStore.get("guest_token")?.value;
  if (!token) redirect(`/join`);

  let result;
  try {
    result = await getParticipantResult(code, token);
  } catch {
    redirect(`/join`);
  }

  const { participant, session, totalQuestions, percentage } = result;

  const rankLabel =
    participant.rank !== null && participant.rank !== undefined
      ? `#${participant.rank}`
      : "—";

  const medalEmoji =
    participant.rank === 1
      ? "🥇"
      : participant.rank === 2
      ? "🥈"
      : participant.rank === 3
      ? "🥉"
      : null;

  const scoreColor =
    percentage >= 70
      ? "text-emerald-600"
      : percentage >= 40
      ? "text-amber-600"
      : "text-red-500";

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4">
        {/* Result card */}
        <div className="bg-white rounded-3xl shadow-lg p-8 text-center space-y-5">
          {/* Emoji / rank */}
          <div className="text-5xl">{medalEmoji ?? "🎯"}</div>

          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">
              {session.title ?? `Session ${session.sessionCode}`}
            </p>
            <h1 className="text-xl font-bold text-gray-900">
              {participant.displayName}
            </h1>
          </div>

          {/* Big score */}
          <div>
            <p className={`text-6xl font-extrabold ${scoreColor}`}>
              {percentage}
              <span className="text-3xl">%</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {participant.correctCount} correct of {totalQuestions} questions
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 pt-2 border-t">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">Score</span>
              <span className="font-bold text-blue-700">
                {participant.totalScore} pts
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">Rank</span>
              <span className="font-bold text-gray-800">{rankLabel}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-gray-400">Wrong</span>
              <span className="font-bold text-red-500">
                {participant.wrongCount}
              </span>
            </div>
          </div>

          {/* Participants count */}
          {session.totalParticipants > 0 && (
            <p className="text-xs text-gray-400">
              {session.totalParticipants} participants in this session
            </p>
          )}
        </div>

        <div className="text-center">
          <Link
            href={`/session/${code}`}
            className="text-sm text-indigo-600 hover:underline"
          >
            ← Back to session
          </Link>
        </div>
      </div>
    </main>
  );
}
