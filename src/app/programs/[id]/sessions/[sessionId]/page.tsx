import { brand } from "@/lib/brand";
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
  getSessionLeaderboard,
  getSessionQuestionsAction,
  gotoLiveQuestion,
} from "@/app/actions/sessions";
import ResetSessionButton from "./ResetSessionButton";
import CopyLinkButton from "./CopyLinkButton";
import ShareLinkButton from "@/components/session/ShareLinkButton";
import SessionLiveStats from "@/components/session/SessionLiveStats";
import SessionParticipantsList from "@/components/session/SessionParticipantsList";
import SessionAnalyticsDashboard from "@/components/session/SessionAnalyticsDashboard";
import SessionLeaderboard from "@/components/session/SessionLeaderboard";
import SessionFinalReport from "@/components/session/SessionFinalReport";

export const dynamic = "force-dynamic";

const SQ_STATUS_AR: Record<string, string> = {
  DRAFT:   "مسودة",
  READY:   "جاهز",
  LIVE:    "مباشر",
  CLOSED:  "مغلق",
  RESULTS: "نتائج",
};

const SQ_STATUS_COLOR: Record<string, string> = {
  DRAFT:   "tp-bg-gray-100 tp-text-gray-500",
  READY:   "tp-bg-blue-100 tp-text-blue-700",
  LIVE:    "tp-bg-green-100 tp-text-green-700",
  CLOSED:  "tp-bg-orange-100 tp-text-orange-700",
  RESULTS: "tp-bg-purple-100 tp-text-purple-700",
};

const STATUS_AR: Record<string, string> = {
  DRAFT:  "مسودة",
  ACTIVE: "نشط",
  PAUSED: "موقوف مؤقتاً",
  ENDED:  "منتهي",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:  "tp-bg-yellow-100 tp-text-yellow-800",
  ACTIVE: "tp-bg-green-100 tp-text-green-800",
  PAUSED: "tp-bg-orange-100 tp-text-orange-800",
  ENDED:  "tp-bg-gray-100 tp-text-gray-600",
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

  const currentOrder = currentSQ?.questionOrder ?? 0;
  const prevQ = questions.find((q) => q.questionOrder === currentOrder - 1) ?? null;
  const nextQ = questions.find((q) => q.questionOrder === currentOrder + 1) ?? null;

  const baseUrl = process.env.NODE_ENV === "production"
    ? brand.productionUrl
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const joinUrl = `${baseUrl}/join/${session.sessionCode}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}&bgcolor=ffffff&color=0f766e&margin=10`;

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page dlp-live-admin">
      <div className="dlp-live-wrap">

        <header className="tp-live-brand"><strong>{brand.nameAr}</strong><span>لوحة إدارة الجلسة المباشرة</span></header>
        {/* Header */}
        <div className="tp-flex tp-items-center tp-gap-3">
          <Link href={`/programs/${id}`} className="tp-text-sm tp-text-gray-500 tp-hover-text-gray-800">
            → البرنامج
          </Link>
          <span className="tp-text-gray-300">/</span>
          <h1 className="tp-font-bold tp-truncate tp-text-gray-800">{session.title}</h1>
        </div>

        {/* Live stats bar */}
        <SessionLiveStats sessionId={sessionId} />

        {/* Live participants list */}
        <SessionParticipantsList sessionId={sessionId} sessionCode={session.sessionCode} />

        {/* Analytics dashboard */}
        <SessionAnalyticsDashboard
          sessionId={sessionId}
          isEnded={session.status === "ENDED"}
        />

        {/* Live / final leaderboard */}
        {(session.status === "ACTIVE" || session.status === "ENDED") && (
          <SessionLeaderboard
            sessionId={sessionId}
            isEnded={session.status === "ENDED"}
          />
        )}

        {/* Final report — shown only after session ends */}
        {session.status === "ENDED" && (
          <SessionFinalReport sessionId={sessionId} />
        )}

        {/* Session info + QR */}
        <div className="brand-card dlp-live-share">
          <div className="tp-space-y-4">
            <div className="tp-flex tp-items-center tp-justify-between">
              <span className={`tp-text-sm tp-font-medium tp-px-3 tp-py-1 tp-rounded-full ${STATUS_COLOR[session.status]}`}>
                {STATUS_AR[session.status] ?? session.status}
              </span>
              <span className="tp-text-sm tp-text-gray-500">
                {session._count.participants} مشارك
              </span>
            </div>

            {/* Session code */}
            <div className="dlp-live-code">
              <p className="tp-text-xs tp-text-gray-500 tp-mb-1">رمز الجلسة</p>
              <p className="dlp-live-code-value" dir="ltr">{session.sessionCode}</p>
              <p className="tp-text-xs tp-text-gray-400 tp-mt-1 tp-break-all">{joinUrl}</p>
              <CopyLinkButton url={joinUrl} />
              <ShareLinkButton url={joinUrl} />
            </div>

            {/* Controls */}
            <div className="tp-flex tp-flex-wrap tp-gap-2">
              {session.status === "DRAFT" && (
                <form action={async () => {
                  "use server";
                  await startLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="tp-px-4 tp-py-2 tp-bg-green-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-green-700">
                    ▶ بدء الاختبار
                  </button>
                </form>
              )}

              {session.status === "ACTIVE" && currentSQ?.status === "LIVE" && (
                <form action={async () => {
                  "use server";
                  await closeLiveQuestion(sessionId, currentSQ.id);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="tp-px-4 tp-py-2 tp-bg-orange-500 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-orange-600">
                    ■ إغلاق السؤال
                  </button>
                </form>
              )}

              {session.status === "ACTIVE" && currentSQ?.status === "CLOSED" && (
                <form action={async () => {
                  "use server";
                  await showQuestionResults(sessionId, currentSQ.id);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="tp-px-4 tp-py-2 tp-bg-purple-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-purple-700">
                    عرض النتائج
                  </button>
                </form>
              )}

              {session.status === "ACTIVE" && (
                <form action={async () => {
                  "use server";
                  await pauseLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="tp-px-4 tp-py-2 tp-border tp-rounded-lg tp-text-sm tp-hover-bg-gray-50">
                    ⏸ إيقاف مؤقت
                  </button>
                </form>
              )}

              {session.status === "PAUSED" && (
                <form action={async () => {
                  "use server";
                  await resumeLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="tp-px-4 tp-py-2 tp-bg-green-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-green-700">
                    ▶ استئناف
                  </button>
                </form>
              )}

              {(session.status === "ACTIVE" || session.status === "PAUSED") && (
                <form action={async () => {
                  "use server";
                  await endLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="tp-px-4 tp-py-2 tp-bg-red-50 tp-text-red-600 tp-border tp-border-red-200 tp-rounded-lg tp-text-sm tp-hover-bg-red-100">
                    إنهاء الاختبار
                  </button>
                </form>
              )}

              {(session.status === "DRAFT" || session.status === "ENDED") && (
                <ResetSessionButton sessionId={sessionId} programId={id} />
              )}

              <form action={async () => {
                "use server";
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="tp-px-4 tp-py-2 tp-border tp-rounded-lg tp-text-sm tp-hover-bg-gray-50">
                  ↻ تحديث
                </button>
              </form>
            </div>
          </div>

          {/* QR Code */}
          <div className="tp-flex tp-flex-col tp-items-center tp-justify-center tp-gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR للانضمام" width={160} height={160} className="tp-rounded-xl tp-border" />
            <p className="tp-text-xs tp-text-gray-500 tp-text-center">امسح للانضمام</p>
          </div>
        </div>

        {/* Prev / Next / Goto navigation */}
        {session.status === "ACTIVE" && (
          <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-4 tp-flex tp-flex-wrap tp-items-center tp-gap-3">
            <span className="tp-text-sm tp-font-medium tp-text-gray-600 tp-ml-auto">التنقل بين الأسئلة:</span>

            {prevQ && (
              <form action={async () => {
                "use server";
                await gotoLiveQuestion(sessionId, prevQ.questionOrder);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="tp-px-4 tp-py-2 tp-bg-gray-100 tp-text-gray-700 tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-gray-200">
                  ← السؤال السابق ({prevQ.questionOrder})
                </button>
              </form>
            )}

            {nextQ && (
              <form action={async () => {
                "use server";
                await gotoLiveQuestion(sessionId, nextQ.questionOrder);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="tp-px-4 tp-py-2 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-blue-700">
                  السؤال التالي ({nextQ.questionOrder}) →
                </button>
              </form>
            )}

            {/* Goto specific question */}
            <form action={async (fd: FormData) => {
              "use server";
              const order = parseInt(fd.get("order") as string, 10);
              if (!isNaN(order)) {
                await gotoLiveQuestion(sessionId, order);
              }
              redirect(`/programs/${id}/sessions/${sessionId}`);
            }} className="tp-flex tp-gap-2 tp-items-center">
              <input
                name="order"
                type="number"
                min={1}
                max={questions.length}
                aria-label="رقم السؤال"
                placeholder="رقم"
                className="tp-w-20 tp-rounded-lg tp-border tp-px-2 tp-py-2 tp-text-sm tp-text-center tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-400"
              />
              <button type="submit" className="tp-px-3 tp-py-2 tp-bg-indigo-600 tp-text-white tp-rounded-lg tp-text-sm tp-hover-bg-indigo-700">
                اذهب
              </button>
            </form>
          </div>
        )}

        {/* Current question */}
        {currentSQ && (
          <div className="brand-card dlp-live-question">
            <div className="tp-flex tp-items-center tp-justify-between tp-mb-3">
              <h2 className="tp-font-semibold tp-text-gray-800">السؤال الحالي — {currentSQ.questionOrder}</h2>
              <span className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full ${SQ_STATUS_COLOR[currentSQ.status]}`}>
                {SQ_STATUS_AR[currentSQ.status] ?? currentSQ.status}
              </span>
            </div>
            <p className="tp-text-gray-700 tp-leading-relaxed">{currentSQ.question.questionText}</p>
          </div>
        )}

        {/* Questions list */}
        <div className="brand-card dlp-live-question">
          <h2 className="tp-font-semibold tp-mb-4 tp-text-gray-800">قائمة الأسئلة ({questions.length})</h2>
          <div className="tp-space-y-2">
            {questions.map((sq) => {
              const isCurrent = sq.id === session.currentQuestionId;
              return (
                <div
                  key={sq.id}
                  className={`tp-flex tp-items-center tp-justify-between tp-text-sm tp-rounded-xl tp-px-3 tp-py-2 tp-border tp-transition-colors ${
                    isCurrent ? "tp-border-blue-400 tp-bg-blue-50" : "tp-border-transparent tp-hover-border-gray-200"
                  }`}
                >
                  <span className="tp-font-mono tp-text-gray-400 tp-w-10 tp-flex-shrink-0">س{sq.questionOrder}</span>
                  <span className="tp-flex-1 tp-text-gray-700 tp-truncate tp-mx-2">{sq.question.questionText}</span>
                  <span className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full tp-flex-shrink-0 tp-ml-2 ${SQ_STATUS_COLOR[sq.status]}`}>
                    {SQ_STATUS_AR[sq.status] ?? sq.status}
                  </span>
                  {session.status === "ACTIVE" && !isCurrent && (
                    <form action={async () => {
                      "use server";
                      await showLiveQuestion(sessionId, sq.id);
                      redirect(`/programs/${id}/sessions/${sessionId}`);
                    }} className="tp-mr-2 tp-flex-shrink-0">
                      <button type="submit" className="tp-text-xs tp-px-2 tp-py-1 tp-bg-blue-600 tp-text-white tp-rounded-md tp-hover-bg-blue-700">
                        اعرض
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Analytics link when session ended */}
        {session.status === "ENDED" && (
          <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-5 tp-flex tp-items-center tp-justify-between">
            <div>
              <p className="tp-font-semibold tp-text-gray-800">انتهى الاختبار</p>
              <p className="tp-text-sm tp-text-gray-500">عرض التحليلات التفصيلية والتصدير إلى Excel</p>
            </div>
            <Link
              href={`/programs/${id}/sessions/${sessionId}/results`}
              className="tp-px-4 tp-py-2 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-blue-700 tp-whitespace-nowrap"
            >
              📊 عرض النتائج
            </Link>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard && leaderboard.length > 0 && (
          <div className="brand-card dlp-live-question">
            <h2 className="tp-font-semibold tp-mb-4 tp-text-gray-800">🏆 المتصدرون النهائيون</h2>
            <div className="tp-space-y-2">
              {leaderboard.map((entry) => (
                <div key={entry.participantId} className="tp-flex tp-items-center tp-justify-between tp-text-sm tp-border tp-rounded-xl tp-px-3 tp-py-2">
                  <span className="tp-w-8 tp-font-mono tp-font-bold tp-text-gray-400">#{entry.rank}</span>
                  <span className="tp-flex-1 tp-font-medium tp-text-gray-800">{entry.displayName}</span>
                  <span className="tp-text-gray-500 tp-text-xs tp-ml-3">{entry.correctCount}/{entry.answersCount} صحيح</span>
                  <span className="tp-font-bold tp-text-blue-700">{entry.totalScore} نقطة</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
