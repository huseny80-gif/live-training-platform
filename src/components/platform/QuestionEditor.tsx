"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateQuestionAction } from "@/app/actions/content";
export default function QuestionEditor({ question }: { question: {
  id: string; questionText: string; correctOptionId: string | null; explanation?: string | null; topic?: string | null;
  options: { id: string; optionLabel: string; optionText: string }[];
} }) {
  const [open, setOpen] = useState(false); const [message, setMessage] = useState(""); const [pending, startTransition] = useTransition(); const router = useRouter();
  function save(form: FormData) {
    setMessage(""); startTransition(async () => {
      try { const result = await updateQuestionAction(question.id, form);
        if (!result.ok) { setMessage(result.error); return; }
        setOpen(false); setMessage("تم حفظ التعديلات. السؤال مسودة للمراجعة والاعتماد."); router.refresh();
      } catch { setMessage("تعذّر حفظ التعديلات. تحقق من اتصالك وصلاحية تسجيل الدخول ثم أعد المحاولة."); }
    });
  }
  return <div className="tp-space-y-3">
    {!open && <button type="button" className="brand-btn brand-btn-secondary" onClick={() => { setOpen(true); setMessage(""); }}>تعديل السؤال والإجابات</button>}
    {open && <form action={save} className="platform-question" aria-label="تعديل السؤال والإجابات">
      <h3>تعديل السؤال والإجابات</h3>
      <label htmlFor={`question-${question.id}`}>نص السؤال</label><textarea id={`question-${question.id}`} className="platform-input" name="questionText" defaultValue={question.questionText} minLength={5} maxLength={1000} rows={3} required/>
      {question.options.map(option => <div key={option.id}><label htmlFor={`option-${option.id}`}>الخيار {option.optionLabel}</label><textarea id={`option-${option.id}`} className="platform-input" name={`option-${option.id}`} defaultValue={option.optionText} maxLength={500} rows={2} required/></div>)}
      <label htmlFor={`correct-${question.id}`}>الإجابة الصحيحة</label><select id={`correct-${question.id}`} className="platform-input" name="correctOptionId" defaultValue={question.correctOptionId ?? ""} required><option value="" disabled>اختر الإجابة الصحيحة</option>{question.options.map(option => <option key={option.id} value={option.id}>الخيار {option.optionLabel}</option>)}</select>
      <label htmlFor={`explanation-${question.id}`}>تفسير الإجابة</label><textarea id={`explanation-${question.id}`} className="platform-input" name="explanation" defaultValue={question.explanation ?? ""} maxLength={2000} rows={2}/>
      <label htmlFor={`topic-${question.id}`}>الموضوع</label><input id={`topic-${question.id}`} className="platform-input" name="topic" defaultValue={question.topic ?? ""} maxLength={200}/>
      <div className="tp-flex tp-gap-3"><button type="submit" disabled={pending} className="brand-btn brand-btn-primary">{pending ? "جاري الحفظ…" : "حفظ التعديلات"}</button><button type="button" disabled={pending} className="brand-btn brand-btn-secondary" onClick={() => { setOpen(false); setMessage(""); }}>إلغاء</button></div>
    </form>}
    {message && <p role="status">{message}</p>}
  </div>;
}
