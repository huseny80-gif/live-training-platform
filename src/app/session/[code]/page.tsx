"use client";

import { errorLabel } from "@/lib/labels";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

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
      const res = await fetch(`/api/session/${code}/state`, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) {
          setError("SESSION_NOT_FOUND");
          return;
        }
        return;
      }
      const data: SessionState = await res.json();
      setState(data);

      // Auto-redirect to result page when session ends
      if (data.sessionStatus === "ENDED" && !redirectedRef.current) {
        redirectedRef.current = true;
        setTimeout(() => router.push(`/session/${code}/result`), 1500);
      }

      const newQId = data.currentQuestion?.sessionQuestionId ?? null;
      if (newQId !== lastQuestionId.current) {
        lastQuestionId.current = newQId;
        setSelectedOption(null);
        setSubmitResult(null);
      }
    } catch {
      // network hiccup — ignore
    }
  }, [code, router]);

  useEffect(() => {
    fetchState();
    const id = setInterval(fetchState, 2000);
    return () => clearInterval(id);
  }, [fetchState]);

  async function submitAnswer(optionId: string) {
    if (!state?.currentQuestion || submitting) return;
    setSubmitting(true);
    setSelectedOption(optionId);
    setSubmitError(null);

    try {
      const res = await fetch("/api/session/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionQuestionId: state.currentQuestion.sessionQuestionId,
          selectedOptionId: optionId,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSubmitResult({ isCorrect: data.isCorrect, scoreAwarded: data.scoreAwarded });
        await fetchState();
      } else {
        setSubmitError(errorLabel(data.error ?? "SUBMIT_ERROR"));
      }
    } catch {
      setSubmitError("خطأ في الشبكة. حاول مجدداً.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    const isNotFound = error === "SESSION_NOT_FOUND";
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="brand-card dlp-join-card tp-text-center tp-space-y-4">
          <div className="tp-text-5xl">⚠️</div>
          <h1 className="tp-text-lg tp-font-bold tp-text-gray-800">
            {isNotFound ? "الجلسة غير موجودة" : "حدث خطأ"}
          </h1>
          <p className="tp-text-sm tp-text-gray-500">
            {isNotFound
              ? "هذه الجلسة غير متاحة أو انتهت. تحقق من الرمز وحاول مجدداً."
              : error}
          </p>
          <a
            href="/join"
            className="tp-inline-block tp-mt-2 tp-px-5 tp-py-2-5 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-text-sm tp-font-medium tp-hover-bg-blue-700"
          >
            العودة للبداية
          </a>
        </div>
      </main>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (!state) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <p className="tp-text-gray-500 tp-animate-pulse">جاري الاتصال…</p>
      </main>
    );
  }

  const { sessionStatus, sessionTitle, dayNumber, totalQuestions, currentQuestionIndex, currentQuestion, hasAnswered, isCorrect, scoreAwarded } = state;

  // ── Session ended — redirect soon, show brief message ────────────────────
  if (sessionStatus === "ENDED") {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="brand-card dlp-join-card tp-text-center tp-space-y-4">
          <div className="tp-text-5xl">🏁</div>
          <h1 className="tp-text-xl tp-font-bold tp-text-gray-900">انتهى الاختبار</h1>
          <p className="tp-text-gray-500">{sessionTitle ?? `اليوم ${dayNumber}`}</p>
          <p className="tp-text-sm tp-text-blue-600 tp-animate-pulse">جاري الانتقال لعرض نتيجتك…</p>
        </div>
      </main>
    );
  }

  // ── Waiting / Paused ─────────────────────────────────────────────────────
  if (sessionStatus === "DRAFT" || sessionStatus === "PAUSED" || !currentQuestion) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="brand-card dlp-join-card tp-text-center tp-space-y-4">
          <div className="tp-text-5xl tp-animate-bounce">⏳</div>
          <h1 className="tp-text-xl tp-font-bold tp-text-gray-900">الحقيبة التدريبية</h1>
          <p className="tp-text-gray-600 tp-font-medium">{sessionTitle ?? `اليوم ${dayNumber}`}</p>
          <p className="tp-text-gray-500 tp-text-sm">
            {sessionStatus === "PAUSED"
              ? "الاختبار موقوف مؤقتاً… انتظر."
              : "في انتظار المدرب لعرض السؤال التالي…"}
          </p>
          <p className="tp-text-xs tp-text-gray-400 tp-font-mono tp-bg-gray-50 tp-px-3 tp-py-1 tp-rounded-full tp-inline-block">رمز: {code}</p>
          <a href="/join" className="tp-block tp-text-xs tp-text-gray-400 tp-hover-text-gray-600 tp-underline tp-mt-2">
            العودة للبداية
          </a>
        </div>
      </main>
    );
  }

  const q = currentQuestion;
  const questionClosed = q.questionStatus === "CLOSED" || q.questionStatus === "RESULTS";
  const canAnswer = q.questionStatus === "LIVE" && !hasAnswered && !submitResult;
  const answered = hasAnswered || !!submitResult;
  const answerIsCorrect = submitResult?.isCorrect ?? isCorrect;
  const answeredScore = submitResult?.scoreAwarded ?? scoreAwarded;

  const progressPercent = totalQuestions > 0 && currentQuestionIndex != null
    ? Math.round((currentQuestionIndex / totalQuestions) * 100)
    : 0;

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page dlp-participant-live">
      <div className="dlp-participant-wrap">

        {/* Header */}
        <div className="dlp-participant-head">
          <h1 className="tp-text-lg tp-font-bold tp-text-blue-800">الحقيبة التدريبية</h1>
          <p className="tp-text-xs tp-text-gray-500">{sessionTitle ?? `اليوم ${dayNumber}`}</p>
        </div>

        {/* Progress bar */}
        {totalQuestions > 0 && currentQuestionIndex != null && (
          <div className="tp-space-y-1">
            <div className="tp-flex tp-justify-between tp-text-xs tp-text-gray-500">
              <span>السؤال {currentQuestionIndex} من {totalQuestions}</span>
              <span>{progressPercent}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`التقدم: ${progressPercent}%`}
              className="tp-h-2 tp-bg-gray-200 tp-rounded-full tp-overflow-hidden"
            >
              <div
                className="tp-h-full tp-bg-blue-500 tp-rounded-full tp-transition-all tp-duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Question text */}
        <div className="dlp-participant-question">
          <p className="tp-text-lg tp-font-semibold tp-leading-relaxed tp-text-gray-800">{q.questionText}</p>
        </div>

        {/* Submit error banner */}
        {submitError && (
          <div role="alert" className="tp-bg-red-50 tp-border tp-border-red-200 tp-rounded-xl tp-px-4 tp-py-3 tp-flex tp-items-center tp-justify-between tp-gap-3">
            <span className="tp-text-sm tp-text-red-700">{submitError}</span>
            <button
              type="button"
              onClick={() => { setSubmitError(null); setSelectedOption(null); }}
              className="tp-text-xs tp-text-red-600 tp-underline tp-flex-shrink-0 tp-hover-text-red-800"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Options */}
        <div className="dlp-participant-options" role="group" aria-label="خيارات الإجابة">
          {q.options.map((opt) => {
            const isSelected = (selectedOption ?? state.myAnswer) === opt.id;
            let cls = "tp-w-full tp-text-right tp-rounded-xl tp-border tp-p-4 tp-flex tp-items-center tp-gap-3 tp-transition-colors ";
            if (canAnswer) {
              cls += isSelected ? "tp-border-blue-500 tp-bg-blue-50 " : "tp-hover-bg-gray-50 tp-cursor-pointer ";
            } else {
              cls += isSelected ? "tp-border-blue-400 tp-bg-blue-50 " : "";
            }
            return (
              <button
                key={opt.id}
                className={cls}
                disabled={!canAnswer || submitting}
                aria-pressed={isSelected}
                onClick={() => canAnswer && submitAnswer(opt.id)}
              >
                {/* Label letter: dir="ltr" so A/B/C renders correctly inside RTL container */}
                <span dir="ltr" className="tp-w-8 tp-h-8 tp-rounded-full tp-border tp-flex tp-items-center tp-justify-center tp-text-sm tp-font-bold tp-flex-shrink-0 tp-bg-white">
                  {opt.optionLabel}
                </span>
                <span className="tp-text-sm tp-text-gray-800 tp-flex-1">{opt.optionText}</span>
              </button>
            );
          })}
        </div>

        <p className="tp-answer-status" role="status" aria-live="polite">{submitting ? "جاري إرسال الإجابة…" : answered ? "تم حفظ إجابتك" : questionClosed ? "في انتظار السؤال التالي…" : "اختر إجابة واحدة لإرسالها"}</p>
        {/* Feedback */}
        {answered && (
          <div className={`tp-rounded-xl tp-p-4 tp-text-center ${
            answerIsCorrect === true ? "tp-bg-green-50 tp-border tp-border-green-200" :
            answerIsCorrect === false ? "tp-bg-red-50 tp-border tp-border-red-200" :
            "tp-bg-gray-50 tp-border"
          }`}>
            {answerIsCorrect === true && <p className="tp-font-bold tp-text-green-700">✓ إجابة صحيحة! +{answeredScore} نقطة</p>}
            {answerIsCorrect === false && <p className="tp-font-bold tp-text-red-700">✗ إجابة خاطئة</p>}
            {answerIsCorrect === null && <p className="tp-text-gray-600">تم تسجيل إجابتك. في انتظار النتائج…</p>}
            {questionClosed && <p className="tp-text-xs tp-text-gray-400 tp-mt-1">في انتظار السؤال التالي…</p>}
          </div>
        )}

        {/* Closed but not answered */}
        {questionClosed && !answered && (
          <div className="tp-bg-orange-50 tp-border tp-border-orange-200 tp-rounded-xl tp-p-4 tp-text-center">
            <p className="tp-text-orange-700 tp-text-sm">انتهى وقت هذا السؤال.</p>
          </div>
        )}
      </div>
    </main>
  );
}
