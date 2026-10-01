"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { brand } from "@/lib/brand";

interface QuestionOption {
  id: string;
  optionLabel: string;
  optionText: string;
  displayOrder: number;
}

interface LiveQuestion {
  sessionQuestionId: string;
  questionText: string;
  options: QuestionOption[];
  questionOrder: number;
  questionStatus: "LIVE" | "CLOSED" | "RESULTS";
  timeLimitSeconds: number | null;
  startedAt: string;
}

interface SessionState {
  sessionStatus: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";
  sessionTitle: string | null;
  dayNumber: number;
  participantCount: number;
  totalQuestions: number;
  currentQuestionIndex: number | null;
  currentQuestion: (LiveQuestion & { questionStatus: string }) | null;
  hasAnswered: boolean;
  myAnswer: string | null;
  isCorrect: boolean | null;
  scoreAwarded: number | null;
  legacyQuestionBlocked?: boolean;
}

function StateCard({
  icon,
  title,
  message,
  code,
}: {
  icon: string;
  title: string;
  message: string;
  code?: string;
}) {
  return (
    <div className="dlp-participant-state-card">
      <div className="dlp-state-icon" aria-hidden="true">{icon}</div>
      <h1>{title}</h1>
      <p>{message}</p>
      {code ? <code dir="ltr">{code}</code> : null}
      <a href="/join" className="dlp-participant-link">العودة للبداية</a>
    </div>
  );
}

export default function ParticipantSessionPage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [state, setState] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ isCorrect: boolean; scoreAwarded: number } | null>(null);
  const lastQuestionId = useRef<string | null>(null);
  const redirectedRef = useRef(false);

  const fetchState = useCallback(async () => {
    try {
      const response = await fetch(`/api/session/${code}/state`, { cache: "no-store" });
      if (!response.ok) {
        if (response.status === 404) setError("SESSION_NOT_FOUND");
        return;
      }

      const data: SessionState = await response.json();
      setState(data);
      setError(null);

      if (data.sessionStatus === "ENDED" && !redirectedRef.current) {
        redirectedRef.current = true;
        setTimeout(() => router.push(`/session/${code}/result`), 1500);
      }

      const newQuestionId = data.currentQuestion?.sessionQuestionId ?? null;
      if (newQuestionId !== lastQuestionId.current) {
        lastQuestionId.current = newQuestionId;
        setSelectedOption(null);
        setSubmitResult(null);
        setSubmitError(null);
      }
    } catch {
      // transient network interruption; polling retries automatically
    }
  }, [code, router]);

  useEffect(() => {
    void fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, [fetchState]);

  async function submitAnswer(optionId: string) {
    if (!state?.currentQuestion || submitting) return;

    setSubmitting(true);
    setSelectedOption(optionId);
    setSubmitError(null);

    try {
      const response = await fetch("/api/session/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionQuestionId: state.currentQuestion.sessionQuestionId,
          selectedOptionId: optionId,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        setSubmitResult({ isCorrect: data.isCorrect, scoreAwarded: data.scoreAwarded });
        await fetchState();
      } else {
        setSubmitError(data.error ?? "فشل إرسال الإجابة.");
      }
    } catch {
      setSubmitError("خطأ في الشبكة. حاول مجدداً.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <StateCard
          icon="⚠️"
          title="الجلسة غير متاحة"
          message="هذه الجلسة غير متاحة أو انتهت. تحقق من الرابط أو رمز الجلسة."
        />
      </main>
    );
  }

  if (!state) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="dlp-participant-state-card">
          <div className="dlp-state-spinner" aria-hidden="true" />
          <h1>{brand.nameAr}</h1>
          <p>جارٍ الاتصال بالجلسة…</p>
        </div>
      </main>
    );
  }

  const {
    sessionStatus,
    sessionTitle,
    dayNumber,
    totalQuestions,
    currentQuestionIndex,
    currentQuestion,
    hasAnswered,
    isCorrect,
    scoreAwarded,
  } = state;

  if (sessionStatus === "ENDED") {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <StateCard
          icon="🏁"
          title="انتهى الاختبار"
          message="جارٍ الانتقال إلى نتيجتك…"
          code={sessionTitle ?? `اليوم ${dayNumber}`}
        />
      </main>
    );
  }

  if (sessionStatus === "DRAFT" || sessionStatus === "PAUSED" || !currentQuestion) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="dlp-participant-state-card">
          <div className="dlp-state-icon" aria-hidden="true">⏳</div>
          <h1>{brand.nameAr}</h1>
          <strong>{sessionTitle ?? `اليوم ${dayNumber}`}</strong>
          <p>
            {state.legacyQuestionBlocked
              ? "تم حجب سؤال قديم غير عربي من هذه الجلسة. احذف الجلسة القديمة من إدارة المحتوى وأنشئ جلسة جديدة لاستخدام بنك الأسئلة العربي."
              : sessionStatus === "PAUSED"
              ? "الاختبار موقوف مؤقتاً. انتظر استئناف المدرب."
              : "في انتظار المدرب لعرض السؤال التالي."}
          </p>
          <code dir="ltr">رمز الجلسة: {code}</code>
          <a href="/join" className="dlp-participant-link">العودة للبداية</a>
        </div>
      </main>
    );
  }

  const question = currentQuestion;
  const questionClosed = question.questionStatus === "CLOSED" || question.questionStatus === "RESULTS";
  const canAnswer = question.questionStatus === "LIVE" && !hasAnswered && !submitResult;
  const answered = hasAnswered || Boolean(submitResult);
  const answerIsCorrect = submitResult?.isCorrect ?? isCorrect;
  const answeredScore = submitResult?.scoreAwarded ?? scoreAwarded;

  const progressPercent =
    totalQuestions > 0 && currentQuestionIndex != null
      ? Math.round((currentQuestionIndex / totalQuestions) * 100)
      : 0;

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page dlp-participant-live">
      <div className="dlp-participant-wrap">
        <header className="dlp-participant-head">
          <span>{brand.nameAr}</span>
          <h1>{sessionTitle ?? `اليوم ${dayNumber}`}</h1>
          <small dir="ltr">رمز الجلسة: {code}</small>
        </header>

        {totalQuestions > 0 && currentQuestionIndex != null ? (
          <section className="dlp-question-progress" aria-label="تقدم الاختبار">
            <div>
              <span>السؤال {currentQuestionIndex} من {totalQuestions}</span>
              <strong>{progressPercent}%</strong>
            </div>
            <div
              className="dlp-progress-track"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`التقدم: ${progressPercent}%`}
            >
              <i style={{ width: `${progressPercent}%` }} />
            </div>
          </section>
        ) : null}

        <section className="dlp-participant-question">
          <span>السؤال Q{question.questionOrder}</span>
          <p>{question.questionText}</p>
        </section>

        {submitError ? (
          <div className="dlp-participant-error" role="alert">
            <span>{submitError}</span>
            <button type="button" onClick={() => { setSubmitError(null); setSelectedOption(null); }}>
              إعادة المحاولة
            </button>
          </div>
        ) : null}

        <div className="dlp-participant-options" role="group" aria-label="خيارات الإجابة">
          {question.options.map((option) => {
            const isSelected = (selectedOption ?? state.myAnswer) === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={!canAnswer || submitting}
                aria-pressed={isSelected}
                onClick={() => canAnswer && void submitAnswer(option.id)}
                className={`dlp-option${isSelected ? " selected" : ""}`}
              >
                <span dir="ltr">{option.optionLabel}</span>
                <strong>{option.optionText}</strong>
              </button>
            );
          })}
        </div>

        {answered ? (
          <div
            className={`dlp-answer-feedback ${
              answerIsCorrect === true ? "correct" : answerIsCorrect === false ? "wrong" : "pending"
            }`}
            role="status"
          >
            {answerIsCorrect === true ? <strong>✓ إجابة صحيحة! +{answeredScore} نقطة</strong> : null}
            {answerIsCorrect === false ? <strong>✗ إجابة خاطئة</strong> : null}
            {answerIsCorrect === null ? <strong>تم تسجيل إجابتك.</strong> : null}
            {questionClosed ? <span>في انتظار السؤال التالي…</span> : null}
          </div>
        ) : null}

        {questionClosed && !answered ? (
          <div className="dlp-answer-feedback expired">
            <strong>انتهى وقت هذا السؤال.</strong>
          </div>
        ) : null}
      </div>
    </main>
  );
}
