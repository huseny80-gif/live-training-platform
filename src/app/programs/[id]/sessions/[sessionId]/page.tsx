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
  DRAFT:   "bg-gray-100 text-gray-500",
  READY:   "bg-blue-100 text-blue-700",
  LIVE:    "bg-green-100 text-green-700",
  CLOSED:  "bg-orange-100 text-orange-700",
  RESULTS: "bg-purple-100 text-purple-700",
};

const STATUS_AR: Record<string, string> = {
  DRAFT:  "مسودة",
  ACTIVE: "نشط",
  PAUSED: "موقوف مؤقتاً",
  ENDED:  "منتهي",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT:  "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  PAUSED: "bg-orange-100 text-orange-800",
  ENDED:  "bg-gray-100 text-gray-600",
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

  const publicOrigin = (process.env.NEXT_PUBLIC_PARTICIPANT_URL ?? "https://live-training-platform.vercel.app").replace(/\/$/, "");
  const joinUrl = `${publicOrigin}/join/${encodeURIComponent(session.sessionCode)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(joinUrl)}&bgcolor=ffffff&color=0f766e&margin=10`;

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page dlp-live-admin">
      <div className="dlp-live-wrap">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/programs/${id}`} className="text-sm text-gray-500 hover:text-gray-800">
            → البرنامج
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="font-bold truncate text-gray-800">{session.title}</h1>
        </div>

        {/* Live stats bar */}
        <SessionLiveStats sessionId={sessionId} />

        {/* Live participants list */}
        <SessionParticipantsList sessionId={sessionId} />

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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className={`text-sm font-medium px-3 py-1 rounded-full ${STATUS_COLOR[session.status]}`}>
                {STATUS_AR[session.status] ?? session.status}
              </span>
              <span className="text-sm text-gray-500">
                {session._count.participants} مشارك
              </span>
            </div>

            {/* Session code */}
            <div className="dlp-live-code">
              <p className="text-xs text-gray-500 mb-1">رمز الجلسة</p>
              <p className="dlp-live-code-value">{session.sessionCode}</p>
              <p className="text-xs text-gray-400 mt-1 break-all">{joinUrl}</p>
              <CopyLinkButton url={joinUrl} />
              <ShareLinkButton url={joinUrl} />
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
                  <button type="submit" className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600">
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
                  <button type="submit" className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700">
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
                  <button type="submit" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
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
                  <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
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
                  <button type="submit" className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100">
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
                <button type="submit" className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  ↻ تحديث
                </button>
              </form>
            </div>
          </div>

          {/* QR Code */}
          <div className="flex flex-col items-center justify-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="QR للانضمام" width={160} height={160} className="rounded-xl border" />
            <p className="text-xs text-gray-500 text-center">امسح للانضمام</p>
          </div>
        </div>

        {/* Prev / Next / Goto navigation */}
        {session.status === "ACTIVE" && (
          <div className="bg-white rounded-2xl border p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-gray-600 ml-auto">التنقل بين الأسئلة:</span>

            {prevQ && (
              <form action={async () => {
                "use server";
                await gotoLiveQuestion(sessionId, prevQ.questionOrder);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
                  ← السؤال السابق (Q{prevQ.questionOrder})
                </button>
              </form>
            )}

            {nextQ && (
              <form action={async () => {
                "use server";
                await gotoLiveQuestion(sessionId, nextQ.questionOrder);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  السؤال التالي (Q{nextQ.questionOrder}) →
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
            }} className="flex gap-2 items-center">
              <input
                name="order"
                type="number"
                min={1}
                max={questions.length}
                placeholder="رقم"
                className="w-20 rounded-lg border px-2 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button type="submit" className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">
                اذهب
              </button>
            </form>
          </div>
        )}

        {/* Current question */}
        {currentSQ && (
          <div className="brand-card dlp-live-question">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-gray-800">السؤال الحالي — Q{currentSQ.questionOrder}</h2>
              <span className={`text-xs px-2 py-0.5 rounded-full ${SQ_STATUS_COLOR[currentSQ.status]}`}>
                {SQ_STATUS_AR[currentSQ.status] ?? currentSQ.status}
              </span>
            </div>
            <p className="text-gray-700 leading-relaxed">{currentSQ.question.questionText}</p>
          </div>
        )}

        {/* Questions list */}
        <div className="bg-white rounded-2xl border p-5">
          <h2 className="font-semibold mb-4 text-gray-800">قائمة الأسئلة ({questions.length})</h2>
          <div className="space-y-2">
            {questions.map((sq) => {
              const isCurrent = sq.id === session.currentQuestionId;
              return (
                <div
                  key={sq.id}
                  className={`flex items-center justify-between text-sm rounded-xl px-3 py-2 border transition-colors ${
                    isCurrent ? "border-blue-400 bg-blue-50" : "border-transparent hover:border-gray-200"
                  }`}
                >
                  <span className="font-mono text-gray-400 w-10 flex-shrink-0">Q{sq.questionOrder}</span>
                  <span className="flex-1 text-gray-700 truncate mx-2">{sq.question.questionText}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${SQ_STATUS_COLOR[sq.status]}`}>
                    {SQ_STATUS_AR[sq.status] ?? sq.status}
                  </span>
                  {session.status === "ACTIVE" && !isCurrent && (
                    <form action={async () => {
                      "use server";
                      await showLiveQuestion(sessionId, sq.id);
                      redirect(`/programs/${id}/sessions/${sessionId}`);
                    }} className="mr-2 flex-shrink-0">
                      <button type="submit" className="text-xs px-2 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">
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
          <div className="bg-white rounded-2xl border p-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-800">انتهى الاختبار</p>
              <p className="text-sm text-gray-500">عرض التحليلات التفصيلية والتصدير إلى Excel</p>
            </div>
            <Link
              href={`/programs/${id}/sessions/${sessionId}/results`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
            >
              📊 عرض النتائج
            </Link>
          </div>
        )}

        {/* Leaderboard */}
        {leaderboard && leaderboard.length > 0 && (
          <div className="bg-white rounded-2xl border p-5">
            <h2 className="font-semibold mb-4 text-gray-800">🏆 المتصدرون النهائيون</h2>
            <div className="space-y-2">
              {leaderboard.map((entry) => (
                <div key={entry.participantId} className="flex items-center justify-between text-sm border rounded-xl px-3 py-2">
                  <span className="w-8 font-mono font-bold text-gray-400">#{entry.rank}</span>
                  <span className="flex-1 font-medium text-gray-800">{entry.displayName}</span>
                  <span className="text-gray-500 text-xs ml-3">{entry.correctCount}/{entry.answersCount} صحيح</span>
                  <span className="font-bold text-blue-700">{entry.totalScore} نقطة</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
