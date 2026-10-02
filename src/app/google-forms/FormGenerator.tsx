"use client";
import { useState } from "react";
import { buildGoogleFormScript, type FormQuestion } from "@/lib/google-forms";
export default function FormGenerator({ title, questions, blockedReason }: { title: string; questions: FormQuestion[]; blockedReason?: string }) {
  const [name, setName] = useState(title);
  const [script, setScript] = useState("");
  const [message, setMessage] = useState("");
  function generate() { setScript(buildGoogleFormScript(name.trim() || title, questions)); setMessage("تم تجهيز الملف لإنشاء الاختبار في حساب Google."); }
  function download() {
    const url = URL.createObjectURL(new Blob([script], { type: "text/javascript;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "training-quiz.gs"; link.click(); URL.revokeObjectURL(url);
  }
  async function copy() { try { await navigator.clipboard.writeText(script); setMessage("تم نسخ الكود."); } catch { setMessage("تعذّر النسخ تلقائياً؛ يمكنك تحديد الكود ونسخه."); } }
  return <section className="brand-card tp-p-4 tp-space-y-3"><h2>إنشاء اختبار Google Forms</h2>
    <p>الأسئلة المعتمدة الجاهزة للتصدير: {questions.length}</p>
    <label htmlFor="form-title">عنوان النموذج</label><input id="form-title" className="platform-input" value={name} onChange={e => setName(e.target.value)} maxLength={200}/>
    <button className="brand-btn brand-btn-primary" disabled={!questions.length || !!blockedReason} onClick={generate}>تجهيز نموذج Google Forms</button>
    {blockedReason && <p>{blockedReason}</p>}
    {!questions.length && <p>اعتمد الأسئلة وحدد الإجابات الصحيحة من إدارة المحتوى أولاً.</p>}
    {message && <p role="status">{message}</p>}
    {script && <><div className="tp-flex tp-gap-3 tp-flex-wrap"><button className="brand-btn brand-btn-secondary" onClick={download}>تحميل ملف النموذج</button><button className="brand-btn brand-btn-secondary" onClick={copy}>نسخ الكود</button></div>
      <label htmlFor="form-script">كود إنشاء النموذج</label><textarea id="form-script" className="platform-script" readOnly value={script}/>
      <ol><li>افتح <a href="https://script.google.com/home/start" target="_blank" rel="noreferrer">Google Apps Script</a> بحساب Google المطلوب وأنشئ مشروعاً جديداً.</li>
        <li>الصق الكود، واحفظه، ثم شغّل الدالة createTrainingQuiz وامنح صلاحية إنشاء النموذج.</li>
        <li>افتح سجل التنفيذ للحصول على رابط التعديل ورابط مشاركة النموذج. كل تشغيل ينشئ نموذجاً جديداً.</li></ol>
    </>}
  </section>;
}
