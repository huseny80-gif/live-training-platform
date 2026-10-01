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
  getSessionQuestionsAction,
  gotoLiveQuestion,
} from "@/app/actions/sessions";
import { buildParticipantJoinUrl } from "@/lib/public-participant-url";
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
  DRAFT: "مسودة",
  READY: "جاهز",
  LIVE: "مباشر",
  CLOSED: "مغلق",
  RESULTS: "نتائج",
};

const STATUS_AR: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  PAUSED: "موقوف مؤقتاً",
  ENDED: "منتهي",
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

  const currentOrder = currentSQ?.questionOrder ?? 0;
  const prevQ = questions.find((q) => q.questionOrder === currentOrder - 1) ?? null;
  const nextQ = questions.find((q) => q.questionOrder === currentOrder + 1) ?? null;

  const joinUrl = buildParticipantJoinUrl(session.sessionCode);
  const qrUrl =
    `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(joinUrl)}&bgcolor=ffffff&color=0f766e&margin=12`;

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page dlp-live-admin">
      <div className="dlp-live-wrap">
        <header className="dlp-live-page-header">
          <div>
            <Link href={`/programs/${id}`} className="dlp-back-link">→ البرنامج</Link>
            <h1>{session.title}</h1>
            <p>إدارة الجلسة المباشرة ومتابعة المشاركين والنتائج.</p>
          </div>
          <span className={`dlp-status-pill status-${session.status.toLowerCase()}`}>
            {STATUS_AR[session.status] ?? session.status}
          </span>
        </header>

        <SessionLiveStats sessionId={sessionId} />

        <section className="brand-card dlp-live-share">
          <div className="dlp-live-share-main">
            <div className="dlp-live-summary">
              <span>الحالة <strong>{STATUS_AR[session.status] ?? session.status}</strong></span>
              <span>المشاركون <strong>{session._count.participants}</strong></span>
              <span>الأسئلة <strong>{questions.length}</strong></span>
            </div>

            <div className="dlp-live-code">
              <span>رمز الجلسة</span>
              <strong dir="ltr" className="dlp-live-code-value">{session.sessionCode}</strong>
              <code dir="ltr">{joinUrl}</code>
              <div className="dlp-share-actions">
                <CopyLinkButton url={joinUrl} />
                <ShareLinkButton url={joinUrl} />
              </div>
            </div>

            <div className="dlp-controls">
              {session.status === "DRAFT" ? (
                <form action={async () => {
                  "use server";
                  await startLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button success">▶ بدء الاختبار</button>
                </form>
              ) : null}

              {session.status === "ACTIVE" && currentSQ?.status === "LIVE" ? (
                <form action={async () => {
                  "use server";
                  await closeLiveQuestion(sessionId, currentSQ.id);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button warning">■ إغلاق السؤال</button>
                </form>
              ) : null}

              {session.status === "ACTIVE" && currentSQ?.status === "CLOSED" ? (
                <form action={async () => {
                  "use server";
                  await showQuestionResults(sessionId, currentSQ.id);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button accent">عرض النتائج</button>
                </form>
              ) : null}

              {session.status === "ACTIVE" ? (
                <form action={async () => {
                  "use server";
                  await pauseLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button neutral">⏸ إيقاف مؤقت</button>
                </form>
              ) : null}

              {session.status === "PAUSED" ? (
                <form action={async () => {
                  "use server";
                  await resumeLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button success">▶ استئناف</button>
                </form>
              ) : null}

              {(session.status === "ACTIVE" || session.status === "PAUSED") ? (
                <form action={async () => {
                  "use server";
                  await endLiveSession(sessionId);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button danger">إنهاء الاختبار</button>
                </form>
              ) : null}

              {(session.status === "DRAFT" || session.status === "ENDED") ? (
                <ResetSessionButton sessionId={sessionId} programId={id} />
              ) : null}

              <form action={async () => {
                "use server";
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }}>
                <button type="submit" className="dlp-control-button neutral">↻ تحديث</button>
              </form>
            </div>
          </div>

          <div className="dlp-qr-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrUrl} alt="رمز QR للانضمام إلى الجلسة" width={190} height={190} />
            <strong>امسح للانضمام</strong>
            <span>يفتح الرابط العام للحقيبة مباشرة، بدون تسجيل دخول Vercel.</span>
          </div>
        </section>

        <SessionParticipantsList sessionId={sessionId} />

        <SessionAnalyticsDashboard sessionId={sessionId} isEnded={session.status === "ENDED"} />

        {(session.status === "ACTIVE" || session.status === "ENDED") ? (
          <SessionLeaderboard sessionId={sessionId} isEnded={session.status === "ENDED"} />
        ) : null}

        {session.status === "ENDED" ? <SessionFinalReport sessionId={sessionId} /> : null}

        {session.status === "ACTIVE" ? (
          <section className="brand-card dlp-question-nav">
            <div>
              <strong>التنقل بين الأسئلة</strong>
              <span>{currentSQ ? `السؤال الحالي Q${currentSQ.questionOrder}` : "لم يتم عرض سؤال بعد"}</span>
            </div>
            <div className="dlp-question-nav-actions">
              {prevQ ? (
                <form action={async () => {
                  "use server";
                  await gotoLiveQuestion(sessionId, prevQ.questionOrder);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button neutral">← Q{prevQ.questionOrder}</button>
                </form>
              ) : null}

              {nextQ ? (
                <form action={async () => {
                  "use server";
                  await gotoLiveQuestion(sessionId, nextQ.questionOrder);
                  redirect(`/programs/${id}/sessions/${sessionId}`);
                }}>
                  <button type="submit" className="dlp-control-button primary">Q{nextQ.questionOrder} →</button>
                </form>
              ) : null}

              <form action={async (formData: FormData) => {
                "use server";
                const order = Number.parseInt(String(formData.get("order") ?? ""), 10);
                if (Number.isFinite(order)) await gotoLiveQuestion(sessionId, order);
                redirect(`/programs/${id}/sessions/${sessionId}`);
              }} className="dlp-goto-form">
                <input name="order" type="number" min={1} max={questions.length} placeholder="رقم" aria-label="رقم السؤال" />
                <button type="submit" className="dlp-control-button accent">اذهب</button>
              </form>
            </div>
          </section>
        ) : null}

        {currentSQ ? (
          <section className="brand-card dlp-live-question">
            <div className="dlp-live-panel-head">
              <h2>السؤال الحالي — Q{currentSQ.questionOrder}</h2>
              <span className={`dlp-status-pill status-${currentSQ.status.toLowerCase()}`}>
                {SQ_STATUS_AR[currentSQ.status] ?? currentSQ.status}
              </span>
            </div>
            <p>{currentSQ.question.questionText}</p>
          </section>
        ) : null}

        <section className="brand-card dlp-live-panel">
          <div className="dlp-live-panel-head">
            <h2>قائمة الأسئلة</h2>
            <span>{questions.length}</span>
          </div>
          <div className="dlp-session-question-list">
            {questions.map((sq) => {
              const isCurrent = sq.id === session.currentQuestionId;
              return (
                <div key={sq.id} className={`dlp-session-question-row${isCurrent ? " current" : ""}`}>
                  <span dir="ltr">Q{sq.questionOrder}</span>
                  <p>{sq.question.questionText}</p>
                  <span className={`dlp-status-pill status-${sq.status.toLowerCase()}`}>
                    {SQ_STATUS_AR[sq.status] ?? sq.status}
                  </span>
                  {session.status === "ACTIVE" && !isCurrent ? (
                    <form action={async () => {
                      "use server";
                      await showLiveQuestion(sessionId, sq.id);
                      redirect(`/programs/${id}/sessions/${sessionId}`);
                    }}>
                      <button type="submit" className="dlp-control-button primary compact">اعرض</button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {session.status === "ENDED" ? (
          <section className="brand-card dlp-end-card">
            <div>
              <h2>انتهى الاختبار</h2>
              <p>النتائج والتحليلات النهائية جاهزة للمراجعة والتصدير.</p>
            </div>
            <Link href={`/programs/${id}/sessions/${sessionId}/results`} className="dlp-control-button primary">
              📊 عرض النتائج التفصيلية
            </Link>
          </section>
        ) : null}
      </div>
    </main>
  );
}
