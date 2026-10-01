"use client";
import { useActionState } from "react";
import { generateFinalQuestions, type FinalQuestionsState } from "@/app/actions/final-questions";

export default function FinalQuestionsClient({ programId }: { programId: string }) {
  const action = generateFinalQuestions.bind(null, programId);
  const [state, dispatch, pending] = useActionState<FinalQuestionsState | null, FormData>(async (prevState, _formData) => generateFinalQuestions(programId, prevState), null);
  return <div className="dlp-final-wrap">
    <form action={dispatch}><button className="brand-button-primary dlp-generate-button" disabled={pending}>{pending ? "جارٍ مراجعة الملف وإنشاء الامتحان…" : "إنشاء الملخص والأسئلة النهائية"}</button></form>
    {state && !state.ok && <p className="dlp-error">{state.error}</p>}
    {state?.ok && <>
      <section className="brand-card dlp-final-section"><h2>ملخص المادة</h2><p>{state.summary}</p></section>
      <section className="brand-card dlp-final-section"><h2>الأسئلة النهائية — 10 MCQ + 20 T/F</h2>
        <div className="dlp-question-list">{state.questions.map((q,i)=><article key={i} className="dlp-final-question"><strong>{i+1}. {q.text}</strong><span>{q.type} · صفحة {q.sourcePage}</span>{q.options && <ul>{q.options.map(o=><li key={o}>{o}</li>)}</ul>}<details><summary>الإجابة والتفسير</summary><p>{q.correctAnswer} — {q.explanation}</p></details></article>)}</div>
      </section>
      <section className="brand-card dlp-final-section"><h2>Google Apps Script</h2><p>انسخ الكود إلى Google Apps Script وشغّل الدالة createTrainingExam لإنشاء Google Form Quiz.</p><textarea className="dlp-code" readOnly value={state.googleAppsScript} rows={24}/></section>
    </>}
  </div>;
}
