"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchiveControls({ batch }: { batch: { id: string; programId: string; title: string | null; questionCount: number; deleted: boolean; generating: boolean } }) {
  const router = useRouter();
  const [mode, setMode] = useState<"none" | "rename" | "regenerate" | "delete" | "purge">("none");
  const [title, setTitle] = useState(batch.title ?? "مادة امتحانية");
  const [count, setCount] = useState(String(batch.questionCount));
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function execute(body: unknown, destination?: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/exam-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMode("none");
      if (data.id) router.push(`/exam-material?programId=${batch.programId}&batchId=${data.id}`);
      else if (destination) router.replace(destination);
      router.refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "تعذّر تنفيذ الإجراء."); }
    finally { setBusy(false); }
  }
  const disabled = busy || batch.generating;
  return <section className="em-glass em-pad em-stack" aria-label="إدارة عملية التوليد">
    <h2>إدارة عملية التوليد · {batch.questionCount} سؤالًا</h2>
    <div className="em-actions">
      <button className="em-button em-secondary" disabled={disabled} onClick={() => setMode("rename")}>تعديل عنوان المادة</button>
      {batch.deleted ? <><button className="em-button" disabled={disabled} onClick={() => execute({ mode: "archive", id: batch.id, action: "restore" }, `/exam-material?programId=${batch.programId}&batchId=${batch.id}`)}>استعادة العملية</button><button className="em-button em-secondary" disabled={disabled} onClick={() => setMode("purge")}>حذف نهائي من المحذوفات</button></> : <>
        <button className="em-button" disabled={disabled} onClick={() => setMode("regenerate")}>إعادة توليد المحتوى</button>
        <button className="em-button em-secondary" disabled={disabled} onClick={() => setMode("delete")}>حذف عملية التوليد</button>
      </>}
    </div>
    {mode === "rename" && <form className="em-stack" onSubmit={e => { e.preventDefault(); void execute({ mode: "archive", id: batch.id, action: "rename", title }); }}>
      <label htmlFor={`archive-title-${batch.id}`}>عنوان المادة</label><input id={`archive-title-${batch.id}`} className="em-share" value={title} onChange={e => setTitle(e.target.value)} minLength={3} maxLength={120} required disabled={busy}/>
      <button className="em-button" disabled={disabled}>حفظ العنوان</button>
    </form>}
    {mode === "regenerate" && <form className="em-stack" onSubmit={e => { e.preventDefault(); void execute({ mode: "regenerate", id: batch.id, count: Number(count) }); }}>
      <p>تُنشأ نسخة مستقلة من النص المحفوظ للمحاضرات نفسها، دون تغيير المادة السابقة أو نتائجها. لتوليد محتوى من ملف PDF محدّث، اختر المحاضرة الجديدة في أعلى الصفحة.</p>
      <label htmlFor={`archive-count-${batch.id}`}>عدد أسئلة النسخة الجديدة</label><input id={`archive-count-${batch.id}`} className="em-share" type="number" min={1} max={50} step={1} value={count} onChange={e => setCount(e.target.value)} required disabled={busy}/>
      <button className="em-button" disabled={disabled || !Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 50}>بدء إعادة التوليد</button>
    </form>}
    {mode === "delete" && <div className="em-stack" role="alert"><p>حذف هذه العملية يوقف رابط المتدربين وينقلها إلى قسم المحذوفات. تُحفظ بياناتها ومحاولات المتدربين ويمكن استعادتها لاحقًا.</p><button className="em-button" disabled={disabled} onClick={() => execute({ mode: "archive", id: batch.id, action: "delete" }, `/exam-material?programId=${batch.programId}&deleted=true&batchId=${batch.id}`)}>تأكيد حذف العملية</button></div>}
    {mode === "purge" && <div className="em-stack" role="alert"><p>الحذف النهائي يزيل هذه العملية ومحتواها ومحاولات المتدربين المرتبطة بها نهائيًا. لا يمكن استعادتها بعد ذلك.</p><button className="em-button" disabled={disabled} onClick={() => execute({ mode: "purge", id: batch.id, confirmed: true }, `/exam-material?programId=${batch.programId}&deleted=true`)}>تأكيد الحذف النهائي</button></div>}
    {mode !== "none" && <button className="em-button em-secondary" disabled={busy} onClick={() => { setMode("none"); setError(""); }}>إلغاء</button>}
    {error && <p role="alert" className="em-error">{error}</p>}
  </section>;
}
