import { cookies } from "next/headers";
import Link from "next/link";
import { getParticipantResult } from "@/app/actions/sessions";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

function ResultState({
  icon,
  title,
  message,
}: {
  icon: string;
  title: string;
  message: string;
}) {
  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <div className="dlp-participant-state-card">
        <div className="dlp-state-icon" aria-hidden="true">{icon}</div>
        <h1>{title}</h1>
        <p>{message}</p>
        <Link href="/join" className="dlp-participant-link">العودة للبداية</Link>
      </div>
    </main>
  );
}

export default async function ParticipantResultPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const cookieStore = await cookies();
  const token = cookieStore.get("guest_token")?.value;

  if (!token) {
    return (
      <ResultState
        icon="🔒"
        title="لم يتم التعرف عليك"
        message="يجب الانضمام إلى الجلسة أولاً لعرض نتيجتك."
      />
    );
  }

  let result;
  try {
    result = await getParticipantResult(code, token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return (
      <ResultState
        icon="⚠️"
        title="تعذر عرض النتيجة"
        message={
          message === "SESSION_NOT_FOUND"
            ? "هذه الجلسة غير موجودة أو لم تكن جزءاً منها."
            : "لم يتم العثور على نتيجتك. قد تكون الجلسة لا تزال جارية."
        }
      />
    );
  }

  const { participant, session, totalQuestions, percentage } = result;
  const rankLabel =
    participant.rank !== null && participant.rank !== undefined
      ? `${participant.rank} من ${session.totalParticipants || "—"}`
      : "—";

  const medal =
    participant.rank === 1 ? "🥇"
    : participant.rank === 2 ? "🥈"
    : participant.rank === 3 ? "🥉"
    : "🎯";

  const scoreTone = percentage >= 70 ? "good" : percentage >= 40 ? "warning" : "danger";

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <div className="dlp-result-wrap">
        <section className="brand-card dlp-result-card">
          <div className="dlp-result-icon" aria-hidden="true">{medal}</div>
          <p className="dlp-result-brand">{brand.nameAr}</p>
          <p className="dlp-result-session">{session.title ?? `الجلسة ${session.sessionCode}`}</p>
          <h1 className="dlp-result-name">{participant.displayName}</h1>

          <p className={`dlp-result-score ${scoreTone}`}>
            {participant.totalScore}
            <small> / {totalQuestions * 10}</small>
          </p>
          <p className={`dlp-result-percent ${scoreTone}`}>{percentage}%</p>
          <p className="dlp-result-caption">نتيجتك في الاختبار</p>

          <div className="dlp-result-stats">
            <div><span>الإجابات الصحيحة</span><strong>{participant.correctCount}</strong></div>
            <div><span>الإجابات الخاطئة</span><strong>{participant.wrongCount}</strong></div>
            <div><span>الترتيب</span><strong>{rankLabel}</strong></div>
          </div>

          <p className="dlp-result-caption">عدد الأسئلة الكلي: {totalQuestions}</p>
        </section>

        <div className="dlp-result-footer">
          <Link href="/join">العودة للبداية</Link>
        </div>
      </div>
    </main>
  );
}
