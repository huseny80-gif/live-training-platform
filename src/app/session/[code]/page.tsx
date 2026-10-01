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
        setSubmitError(data.error ?? "فشل إرسال الإجابة.");
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
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-lg font-bold text-gray-800">
            {isNotFound ? "الجلسة غير موجودة" : "حدث خطأ"}
          </h1>
          <p className="text-sm text-gray-500">
            {isNotFound
              ? "هذه الجلسة غير متاحة أو انتهت. تحقق من الرمز وحاول مجدداً."
              : error}
          </p>
          <a
            href="/join"
            className="inline-block mt-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
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
        <p className="text-gray-500 animate-pulse">جاري الاتصال…</p>
      </main>
    );
  }

  const { sessionStatus, sessionTitle, dayNumber, totalQuestions, currentQuestionIndex, currentQuestion, hasAnswered, isCorrect, scoreAwarded } = state;

  // ── Session ended — redirect soon, show brief message ────────────────────
  if (sessionStatus === "ENDED") {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="bg-white rounded-2xl border p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl">🏁</div>
          <h1 className="text-xl font-bold text-gray-900">انتهى الاختبار</h1>
          <p className="text-gray-500">{sessionTitle ?? `اليوم ${dayNumber}`}</p>
          <p className="text-sm text-blue-600 animate-pulse">جاري الانتقال لعرض نتيجتك…</p>
        </div>
      </main>
    );
  }

  // ── Waiting / Paused ─────────────────────────────────────────────────────
  if (sessionStatus === "DRAFT" || sessionStatus === "PAUSED" || !currentQuestion) {
    return (
      <main dir="rtl" lang="ar" className="dlp-participant-page">
        <div className="bg-white rounded-2xl border shadow-sm p-8 text-center max-w-sm space-y-4">
          <div className="text-5xl animate-bounce">⏳</div>
          <h1 className="text-xl font-bold text-gray-900">{brand.nameAr}</h1>
          <p className="text-gray-600 font-medium">{sessionTitle ?? `اليوم ${dayNumber}`}</p>
          <p className="text-gray-500 text-sm">
            {state.legacyQuestionBlocked
              ? "تم حجب سؤال قديم غير عربي من هذه الجلسة. يرجى من المدرب حذف الجلسة القديمة وإنشاء جلسة عربية جديدة."
              : sessionStatus === "PAUSED"
              ? "الاختبار موقوف مؤقتاً… انتظر."
              : "في انتظار المدرب لعرض السؤال التالي…"}
          </p>
          <p className="text-xs text-gray-400 font-mono bg-gray-50 px-3 py-1 rounded-full inline-block">رمز: {code}</p>
          <a href="/join" className="block text-xs text-gray-400 hover:text-gray-600 underline mt-2">
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
          <h1 className="text-lg font-bold text-blue-800">{brand.nameAr}</h1>
          <p className="text-xs text-gray-500">{sessionTitle ?? `اليوم ${dayNumber}`}</p>
        </div>

        {/* Progress bar */}
        {totalQuestions > 0 && currentQuestionIndex != null && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>السؤال {currentQuestionIndex} من {totalQuestions}</span>
              <span>{progressPercent}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`التقدم: ${progressPercent}%`}
              className="h-2 bg-gray-200 rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Question text */}
        <div className="dlp-participant-question">
          <p className="text-lg font-semibold leading-relaxed text-gray-800">{q.questionText}</p>
        </div>

        {/* Submit error banner */}
        {submitError && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
            <span className="text-sm text-red-700">{submitError}</span>
            <button
              type="button"
              onClick={() => { setSubmitError(null); setSelectedOption(null); }}
              className="text-xs text-red-600 underline flex-shrink-0 hover:text-red-800"
            >
              إعادة المحاولة
            </button>
          </div>
        )}

        {/* Options */}
        <div className="dlp-participant-options" role="group" aria-label="خيارات الإجابة">
          {q.options.map((opt) => {
            const isSelected = (selectedOption ?? state.myAnswer) === opt.id;
            let cls = "w-full text-right rounded-xl border p-4 flex items-center gap-3 transition-colors ";
            if (canAnswer) {
              cls += isSelected ? "border-blue-500 bg-blue-50 " : "hover:bg-gray-50 cursor-pointer ";
            } else {
              cls += isSelected ? "border-blue-400 bg-blue-50 " : "";
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
                <span dir="ltr" className="w-8 h-8 rounded-full border flex items-center justify-center text-sm font-bold flex-shrink-0 bg-white">
                  {opt.optionLabel}
                </span>
                <span className="text-sm text-gray-800 flex-1">{opt.optionText}</span>
              </button>
            );
          })}
        </div>

        {/* Feedback */}
        {answered && (
          <div className={`rounded-xl p-4 text-center ${
            answerIsCorrect === true ? "bg-green-50 border border-green-200" :
            answerIsCorrect === false ? "bg-red-50 border border-red-200" :
            "bg-gray-50 border"
          }`}>
            {answerIsCorrect === true && <p className="font-bold text-green-700">✓ إجابة صحيحة! +{answeredScore} نقطة</p>}
            {answerIsCorrect === false && <p className="font-bold text-red-700">✗ إجابة خاطئة</p>}
            {answerIsCorrect === null && <p className="text-gray-600">تم تسجيل إجابتك. في انتظار النتائج…</p>}
            {questionClosed && <p className="text-xs text-gray-400 mt-1">في انتظار السؤال التالي…</p>}
          </div>
        )}

        {/* Closed but not answered */}
        {questionClosed && !answered && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <p className="text-orange-700 text-sm">انتهى وقت هذا السؤال.</p>
          </div>
        )}
      </div>
    </main>
  );
}
