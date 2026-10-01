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
        <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-8 tp-text-center tp-max-w-sm tp-space-y-4">
          <p className="tp-font-bold tp-text-blue-700">الحقيبة التدريبية</p>
          <div className="tp-text-5xl">🔒</div>
          <h1 className="tp-text-lg tp-font-bold tp-text-gray-800">لم يتم التعرف عليك</h1>
          <p className="tp-text-sm tp-text-gray-500">يجب الانضمام إلى الجلسة أولاً لعرض نتيجتك.</p>
          <Link
            href="/join"
            className="tp-inline-block tp-mt-2 tp-px-5 tp-py-2-5 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-blue-700"
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
        <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-8 tp-text-center tp-max-w-sm tp-space-y-4">
          <p className="tp-font-bold tp-text-blue-700">الحقيبة التدريبية</p>
          <div className="tp-text-5xl">⚠️</div>
          <h1 className="tp-text-lg tp-font-bold tp-text-gray-800">
            {isEnded ? "الجلسة غير متاحة" : "هذه الجلسة غير متاحة أو انتهت"}
          </h1>
          <p className="tp-text-sm tp-text-gray-500">
            {isEnded
              ? "هذه الجلسة غير موجودة أو لم تكن جزءاً منها."
              : "لم يتم العثور على نتيجتك. قد تكون الجلسة لا تزال جارية."}
          </p>
          <Link
            href="/join"
            className="tp-inline-block tp-mt-2 tp-px-5 tp-py-2-5 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-blue-700"
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
    percentage >= 70 ? "tp-text-emerald-600"
    : percentage >= 40 ? "tp-text-amber-600"
    : "tp-text-red-500";

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <div className="tp-result-wrap tp-space-y-4">
        {/* Result card */}
        <div className="brand-card tp-result-card tp-text-center tp-space-y-5">
          {/* Emoji / rank */}
          <div className="tp-text-5xl">{medalEmoji ?? "🎯"}</div>

          <div>
            <p className="tp-text-xs tp-text-gray-400 tp-font-medium tp-uppercase tp-tracking-widest tp-mb-1">
              الحقيبة التدريبية
            </p>
            <p className="tp-text-sm tp-text-gray-500 tp-mb-0-5">{session.title ?? `الجلسة ${session.sessionCode}`}</p>
            <h1 className="tp-text-xl tp-font-bold tp-text-gray-900">{participant.displayName}</h1>
          </div>

          {/* Big score */}
          <div>
            <p className={`tp-text-5xl tp-font-extrabold ${scoreColor}`}>
              {participant.totalScore}
              <span className="tp-text-2xl tp-text-gray-400 tp-font-normal"> / {totalQuestions * 10}</span>
            </p>
            <p className={`tp-text-3xl tp-font-bold tp-mt-1 ${scoreColor}`}>
              {percentage}<span className="tp-text-xl">%</span>
            </p>
            <p className="tp-text-sm tp-text-gray-400 tp-mt-1">
              نتيجتك في الاختبار
            </p>
          </div>

          {/* Stats row */}
          <div className="tp-grid tp-grid-cols-3 tp-gap-3 tp-pt-3 tp-border-t">
            <div className="tp-flex tp-flex-col tp-gap-0-5 tp-items-center">
              <span className="tp-text-xs tp-text-gray-400">الإجابات الصحيحة</span>
              <span className="tp-font-bold tp-text-emerald-600 tp-text-lg">{participant.correctCount}</span>
            </div>
            <div className="tp-flex tp-flex-col tp-gap-0-5 tp-items-center">
              <span className="tp-text-xs tp-text-gray-400">الإجابات الخاطئة</span>
              <span className="tp-font-bold tp-text-red-500 tp-text-lg">{participant.wrongCount}</span>
            </div>
            <div className="tp-flex tp-flex-col tp-gap-0-5 tp-items-center">
              <span className="tp-text-xs tp-text-gray-400">الترتيب</span>
              <span className="tp-font-bold tp-text-blue-700 tp-text-base">{rankLabel}</span>
            </div>
          </div>

          {/* Total questions */}
          <p className="tp-text-xs tp-text-gray-400">
            عدد الأسئلة الكلي: {totalQuestions}
          </p>
        </div>

        {/* Back button */}
        <div className="tp-text-center">
          <Link
            href="/join"
            className="tp-inline-block tp-px-6 tp-py-2-5 tp-bg-white tp-border tp-rounded-xl tp-text-sm tp-text-gray-600 tp-hover-bg-gray-50 tp-shadow-sm"
          >
            العودة للبداية
          </Link>
        </div>
      </div>
    </main>
  );
}
