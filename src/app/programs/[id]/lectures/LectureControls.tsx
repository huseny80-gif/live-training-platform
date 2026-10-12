"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument, restoreDocument, updateDocumentName } from "@/app/actions/documents";
import DocumentUpload from "../DocumentUpload";

export default function LectureControls({ programId, document }: { programId: string; document: {
  id: string; fileName: string; archived: boolean; busy: boolean;
} }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "rename" | "replace" | "delete">("idle");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function change(operation: () => Promise<unknown>, success: string, nextUrl?: string) {
    setMessage("");
    startTransition(async () => {
      try { await operation(); setMode("idle"); setMessage(success); if (nextUrl) router.replace(nextUrl); router.refresh(); }
      catch(e) {
        const code = e instanceof Error ? e.message : "";
        setMessage(code === "LECTURE_BUSY" ? "انتظر انتهاء معالجة المحاضرة قبل إدارتها." : "تعذّر حفظ التغيير. تحقق من الاسم والصلاحيات وأعد المحاولة.");
      }
    });
  }
  const disabled = pending || document.busy;
  return <div className="em-stack">
    <div className="em-actions">
      <button disabled={disabled} className="em-button em-secondary" onClick={() => { setMode(mode === "rename" ? "idle" : "rename"); setMessage(""); }}>تعديل اسم المحاضرة</button>
      {document.archived ? <button disabled={disabled} className="em-button" onClick={() => change(() => restoreDocument(document.id), "تمت استعادة المحاضرة إلى المحتوى النشط.", `/programs/${programId}/lectures?documentId=${document.id}`)}>استعادة المحاضرة</button> : <>
        <button disabled={disabled} className="em-button em-secondary" onClick={() => { setMode(mode === "replace" ? "idle" : "replace"); setMessage(""); }}>تعديل المحتوى / استبدال PDF</button>
        <button disabled={disabled} className="em-button em-secondary" onClick={() => { setMode("delete"); setMessage(""); }}>حذف المحاضرة</button>
      </>}
    </div>
    {document.busy && <p className="em-muted">تُتاح الإدارة بعد انتهاء معالجة المحاضرة.</p>}
    {mode === "rename" && <form className="em-stack" action={data => {
      change(() => updateDocumentName(document.id, String(data.get("name") ?? "")), "تم تعديل اسم المحاضرة.");
    }}><label htmlFor={`lecture-name-${document.id}`}>اسم المحاضرة</label><input id={`lecture-name-${document.id}`} className="em-share" name="name" defaultValue={document.fileName} minLength={3} maxLength={200} required disabled={disabled}/><div className="em-actions"><button className="em-button" disabled={disabled}>حفظ الاسم</button><button type="button" className="em-button em-secondary" disabled={pending} onClick={() => setMode("idle")}>إلغاء</button></div></form>}
    {mode === "replace" && <div className="lecture-upload"><DocumentUpload key={document.id} programId={programId} replaceDocumentId={document.id}/><p className="em-muted">تحديث المحاضرة لا يعيد توليد الملخصات أو الأسئلة السابقة. بعد قبول النسخة الجديدة، اخترها في «المادة الامتحانية» لتوليد محتوى جديد.</p></div>}
    {mode === "delete" && <section className="em-glass em-pad em-stack" role="alert"><p>هل تريد حذف «{document.fileName}» من المحتوى النشط؟ ستبقى في الأرشيف لحفظ مصادر الأسئلة والنتائج السابقة، ويمكنك استعادتها.</p><div className="em-actions"><button disabled={disabled} className="em-button" onClick={() => change(() => deleteDocument(document.id), "حُذفت المحاضرة من المحتوى النشط وحُفظت في الأرشيف.", `/programs/${programId}/lectures?archived=true&documentId=${document.id}`)}>تأكيد حذف المحاضرة</button><button disabled={pending} className="em-button em-secondary" onClick={() => setMode("idle")}>إلغاء</button></div></section>}
    {message && <p role="status">{message}</p>}
  </div>;
}
