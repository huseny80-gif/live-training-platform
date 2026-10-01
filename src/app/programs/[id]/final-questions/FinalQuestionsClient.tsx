"use client";

import { useActionState } from "react";
import {
  generateFinalQuestions,
  type FinalQuestionsState,
} from "@/app/actions/final-questions";

export default function FinalQuestionsClient({ programId }: { programId: string }) {
  const [state, dispatch, pending] = useActionState<FinalQuestionsState | null, FormData>(
    async (prevState, formData) => generateFinalQuestions(programId, prevState, formData),
    null
  );

  return (
    <div className="dlp-final-wrap">
      <form action={dispatch}>
        <button className="brand-button-primary dlp-generate-button" disabled={pending}>
          {pending ? "جارٍ مراجعة الملف وإنشاء الامتحان…" : "إنشاء الملخص والأسئلة النهائية"}
        </button>
      </form>

      {state && !state.ok ? <p className="dlp-error">{state.error}</p> : null}

      {state?.ok ? (
        <>
          <section className="brand-card dlp-final-section">
            <h2>ملخص المادة</h2>
            <p>{state.summary}</p>
          </section>

          <section className="brand-card dlp-final-section">
            <h2>الأسئلة النهائية — 10 اختيار من متعدد + 20 صح/خطأ</h2>
            <div className="dlp-question-list">
              {state.questions.map((question, index) => (
                <article key={`${index}-${question.text}`} className="dlp-final-question">
                  <strong>{index + 1}. {question.text}</strong>
                  <span>{question.type} · صفحة {question.sourcePage}</span>
                  {question.options ? (
                    <ul>
                      {question.options.map((option) => <li key={option}>{option}</li>)}
                    </ul>
                  ) : null}
                  <details>
                    <summary>الإجابة والتفسير</summary>
                    <p>{question.correctAnswer} — {question.explanation}</p>
                  </details>
                </article>
              ))}
            </div>
          </section>

          <section className="brand-card dlp-final-section">
            <h2>Google Apps Script</h2>
            <p>
              انسخ الكود إلى Google Apps Script وشغّل الدالة
              <code dir="ltr"> createTrainingExam </code>
              لإنشاء Google Form Quiz.
            </p>
            <textarea
              className="dlp-code"
              readOnly
              value={state.googleAppsScript}
              rows={24}
              aria-label="Google Apps Script"
            />
          </section>
        </>
      ) : null}
    </div>
  );
}
