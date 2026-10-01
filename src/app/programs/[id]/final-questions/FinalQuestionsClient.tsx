"use client";

import { useState } from "react";
import Link from "next/link";
import {
  generateFinalQuestions,
  type FinalQuestionsState,
} from "@/app/actions/final-questions";
import { runDocumentSourcePreparation } from "@/lib/client/document-source";
import CopyCodeButton from "@/components/CopyCodeButton";

export default function FinalQuestionsClient({ programId }: { programId: string }) {
  const [state, setState] = useState<FinalQuestionsState | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setState(null);
    setProgress("جارٍ التحقق من المصدر الحقيقي…");

    try {
      let result = await generateFinalQuestions(programId, null, new FormData());

      if (!result.ok && result.code === "SOURCE_NOT_READY") {
        if (!result.documentId) {
          setState(result);
          setProgress("");
          return;
        }

        setProgress(
          "المصدر الحقيقي غير مكتمل. جارٍ متابعة استخراج PDF من آخر تقدم محفوظ…"
        );

        await runDocumentSourcePreparation({
          documentId: result.documentId,
          onProgress: (message) => setProgress(message),
        });

        setProgress(
          "اكتمل اعتماد المصدر الحقيقي. جارٍ إنشاء 10 أسئلة اختيار من متعدد و20 سؤال صح/خطأ…"
        );
        result = await generateFinalQuestions(programId, null, new FormData());
      }

      setState(result);
      setProgress(result.ok ? "اكتمل إنشاء الامتحان النهائي بنجاح." : "");
    } catch (error) {
      setState({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "تعذر إكمال إصلاح المصدر وإنشاء الأسئلة النهائية.",
      });
      setProgress("");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="dlp-final-wrap">
      <form onSubmit={handleGenerate}>
        <button className="brand-button-primary dlp-generate-button" disabled={pending}>
          {pending ? "جارٍ اعتماد المصدر وتوليد الامتحان…" : "إنشاء الملخص والأسئلة النهائية"}
        </button>
      </form>

      {progress ? (
        <div className="brand-card dlp-final-progress" role="status">
          {progress}
        </div>
      ) : null}

      {state && !state.ok ? (
        <div className="dlp-final-error-box">
          <p className="dlp-error">{state.error}</p>
          <Link href={`/programs/${programId}`} className="dlp-control-button primary">
            فتح المادة التدريبية
          </Link>
        </div>
      ) : null}

      {state?.ok ? (
        <>
          <section className="brand-card dlp-final-section">
            <div className="dlp-final-source">
              <span>المصدر المستخدم</span>
              <strong>{state.sourceFileName}</strong>
              <small>{state.sourcePageCount} صفحة حقيقية مستخرجة</small>
            </div>
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
            <h2>Google Forms Quiz</h2>
            <p>
              انسخ الكود إلى Google Apps Script وشغّل الدالة
              <code dir="ltr"> createTrainingExam </code>
              لإنشاء Google Form Quiz مع الإجابات الصحيحة والنقاط.
            </p>
            <div className="dlp-google-actions">
              <CopyCodeButton value={state.googleAppsScript} />
              <a
                href="https://script.google.com/home/projects/create"
                target="_blank"
                rel="noreferrer"
                className="dlp-control-button neutral"
              >
                فتح Google Apps Script
              </a>
            </div>
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
