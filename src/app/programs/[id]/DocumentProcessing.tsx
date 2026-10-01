"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { documentErrorLabel } from "@/lib/document-errors";
import { statusLabel } from "@/lib/labels";

export default function DocumentProcessing({ documentId, programId, status, notes }: {
  documentId: string; programId: string; status: string; notes: string | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [reason, setReason] = useState(notes);
  const [requesting, setRequesting] = useState(false);
  const [pollExpired, setPollExpired] = useState(false);
  const busy = requesting || current === "PROCESSING";
  const failed = current === "FAILED" || current === "OCR_REQUIRED";
  useEffect(() => { setCurrent(status); setReason(notes); }, [status, notes]);
  useEffect(() => {
    if (current !== "PROCESSING") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const response = await fetch(`/api/documents/status?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;
          setReason(data.extractionNotes);
          setCurrent(data.extractionStatus);
          if (data.extractionStatus !== "PROCESSING") { router.refresh(); return; }
        }
      } catch { /* A temporary network failure does not start another job. */ }
      if (!cancelled && ++attempts < 120) timer = setTimeout(poll, 4000);
      else if (!cancelled) setPollExpired(true);
    }
    timer = setTimeout(poll, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [current, documentId, router]);

  async function retry() {
    setRequesting(true); setPollExpired(false);
    try {
      const response = await fetch("/api/documents/process", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, programId }),
      });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data = await response.json();
      setReason(null); setCurrent(data.status);
      if (data.status === "COMPLETED") router.refresh();
    } catch (error) { setReason(error instanceof Error ? error.message : "REQUEST_FAILED"); }
    finally { setRequesting(false); }
  }

  return <div className="tp-space-y-2">
    <p className={`tp-text-xs ${failed ? "tp-text-red-700" : "tp-text-gray-500"}`} role="status">{statusLabel(current)}</p>
    {failed && <>
      <p className="tp-text-sm tp-text-red-700" role="alert">{documentErrorLabel(reason)}</p>
      <button type="button" onClick={retry} disabled={busy} className="brand-btn brand-btn-secondary">
        {requesting ? "جاري بدء المعالجة…" : "إعادة المعالجة"}
      </button>
    </>}
    {current === "PENDING" && <button type="button" onClick={retry} disabled={busy} className="brand-btn brand-btn-secondary">بدء المعالجة</button>}
    {current === "PROCESSING" && <p className="tp-text-xs tp-text-gray-500">{pollExpired ? "تستمر المعالجة في الخلفية. حدّث الصفحة لمتابعة الحالة." : "جاري استخراج النص وتوليد الأسئلة…"}</p>}
  </div>;
}
