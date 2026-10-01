import { cookies } from "next/headers";
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

  // No token — show Arabic error page instead of redirect
  if (!token) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl">🔒</div>
          <h1 className="text-lg font-bold text-gray-800">لم يتم التعرف عليك</h1>
          <p className="text-sm text-gray-500">يجب الانضمام إلى الجلسة أولاً لعرض نتيجتك.</p>
          <Link
            href="/join"
            className="inline-block mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            العودة للبداية
          </Link>
        </div>
      </main>
    );
  }

  let result;
  try {
    result = await getParticipantResult(code, token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ERROR";
    const isEnded = msg === "SESSION_NOT_FOUND";
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-lg font-bold text-gray-800">
            {isEnded ? "الجلسة غير متاحة" : "هذه الجلسة غير متاحة أو انتهت"}
          </h1>
          <p className="text-sm text-gray-500">
            {isEnded
              ? "هذه الجلسة غير موجودة أو لم تكن جزءاً منها."
              : "لم يتم العثور على نتيجتك. قد تكون الجلسة لا تزال جارية."}
          </p>
          <Link
            href="/join"
            className="inline-block mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            العودة للبداية
          </Link>
        </div>
      </main>
    );
  }

  const { participant, session, totalQuestions, percentage } = result;

  const rankLabel =
    participant.rank !== null && participant.rank !== undefined
      ? `${participant.rank} من ${session.totalParticipants || "—"}`
      : "—";

  const medalEmoji =
    participant.rank === 1 ? "🥇"
    : participant.rank === 2 ? "🥈"
    : participant.rank === 3 ? "🥉"
    : null;

  const scoreColor =
    percentage >= 70 ? "text-emerald-600"
    : percentage >= 40 ? "text-amber-600"
    : "text-red-500";

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <div className="w-full max-w-sm space-y-4">
        {/* Result card */}
        <div className="bg-white rounded-3xl shadow-lg p-8 text-center space-y-5">
          {/* Emoji / rank */}
          <div className="text-5xl">{medalEmoji ?? "🎯"}</div>

          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-1">
              الحقيبة التدريبية
            </p>
            <p className="text-sm text-gray-500 mb-0.5">{session.title ?? `الجلسة ${session.sessionCode}`}</p>
            <h1 className="text-xl font-bold text-gray-900">{participant.displayName}</h1>
          </div>

          {/* Big score */}
          <div>
            <p className={`text-5xl font-extrabold ${scoreColor}`}>
              {participant.totalScore}
              <span className="text-2xl text-gray-400 font-normal"> / {totalQuestions * 10}</span>
            </p>
            <p className={`text-3xl font-bold mt-1 ${scoreColor}`}>
              {percentage}<span className="text-xl">%</span>
            </p>
            <p className="text-sm text-gray-400 mt-1">
              نتيجتك في الاختبار
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3 pt-3 border-t">
            <div className="flex flex-col gap-0.5 items-center">
              <span className="text-xs text-gray-400">الإجابات الصحيحة</span>
              <span className="font-bold text-emerald-600 text-lg">{participant.correctCount}</span>
            </div>
            <div className="flex flex-col gap-0.5 items-center">
              <span className="text-xs text-gray-400">الإجابات الخاطئة</span>
              <span className="font-bold text-red-500 text-lg">{participant.wrongCount}</span>
            </div>
            <div className="flex flex-col gap-0.5 items-center">
              <span className="text-xs text-gray-400">الترتيب</span>
              <span className="font-bold text-blue-700 text-base">{rankLabel}</span>
            </div>
          </div>

          {/* Total questions */}
          <p className="text-xs text-gray-400">
            عدد الأسئلة الكلي: {totalQuestions}
          </p>
        </div>

        {/* Back button */}
        <div className="text-center">
          <Link
            href="/join"
            className="inline-block px-6 py-2.5 bg-white border rounded-xl text-sm text-gray-600 hover:bg-gray-50 shadow-sm"
          >
            العودة للبداية
          </Link>
        </div>
      </div>
    </main>
  );
}
