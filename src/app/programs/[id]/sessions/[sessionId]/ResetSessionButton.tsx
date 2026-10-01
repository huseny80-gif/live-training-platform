"use client";

import { useState, useTransition } from "react";
import { resetLiveSession } from "@/app/actions/sessions";
import { useRouter } from "next/navigation";

export default function ResetSessionButton({ sessionId }: { sessionId: string; programId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReset() {
    startTransition(async () => {
      await resetLiveSession(sessionId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="dlp-control-button danger">
        🔄 تصفير الجلسة
      </button>
      {open ? (
        <div className="dlp-modal-backdrop" role="presentation">
          <div dir="rtl" lang="ar" role="dialog" aria-modal="true" aria-labelledby="reset-title" className="dlp-modal">
            <div className="dlp-modal-icon">⚠️</div>
            <h2 id="reset-title">تأكيد تصفير الجلسة</h2>
            <p>سيتم حذف جميع المشاركين وإجاباتهم ونتائجهم، ولن يتأثر بنك الأسئلة.</p>
            <strong className="dlp-modal-warning">هذا الإجراء لا يمكن التراجع عنه.</strong>
            <div className="dlp-modal-actions">
              <button type="button" onClick={() => setOpen(false)} disabled={isPending} className="dlp-control-button neutral">إلغاء</button>
              <button type="button" onClick={handleReset} disabled={isPending} className="dlp-control-button danger solid">
                {isPending ? "جاري التصفير…" : "تصفير الجلسة"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
