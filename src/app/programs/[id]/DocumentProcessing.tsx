"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { documentErrorLabel } from "@/lib/document-errors";
import DocumentGeneration from "./DocumentGeneration";
import { statusLabel } from "@/lib/labels";

export default function DocumentProcessing({ documentId, programId, status, notes, hasContent = false }: {
  documentId: string; programId: string; status: string; notes: string | null; hasContent?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [reason, setReason] = useState(notes);
  const [requesting, setRequesting] = useState(false);
  const [pollExpired, setPollExpired] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pollCycle, setPollCycle] = useState(0);
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
        if (cancelled) return;
        if (response.status === 401 || response.status === 403 || (response.redirected && new URL(response.url).pathname === "/login")) {
          setConnectionError("انتهت جلسة تسجيل الدخول. سجّل الدخول مجدداً لمتابعة حالة المستند.");
          return;
        }
        if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;
          if (!["PENDING", "PROCESSING", "COMPLETED", "FAILED", "OCR_REQUIRED"].includes(data.extractionStatus)) throw new Error("INVALID_STATUS");
          setConnectionError(null);
          setReason(data.extractionNotes);
          setCurrent(data.extractionStatus);
          if (data.extractionStatus !== "PROCESSING") { router.refresh(); return; }
        }
      } catch {
        if (!cancelled) setConnectionError("تعذّر الاتصال لمتابعة حالة المستند. لم يُؤكد اكتمال المعالجة. جرّب تحديث الحالة.");
      }
      if (!cancelled && ++attempts < 120) timer = setTimeout(poll, 4000);
      else if (!cancelled) setPollExpired(true);
    }
    timer = setTimeout(poll, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [current, documentId, router, pollCycle]);

  async function retry() {
    setRequesting(true); setPollExpired(false);
    try {
      const response = await fetch("/api/documents/process", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, programId }),
      });
      if (response.redirected && new URL(response.url).pathname === "/login") throw new Error("SESSION_EXPIRED");
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : `HTTP_${response.status}`);
      setReason(null); setCurrent(data.status);
      if (data.status === "COMPLETED") router.refresh();
    } catch (error) { setReason(error instanceof Error ? error.message : "REQUEST_FAILED"); }
    finally { setRequesting(false); }
  }

  return <div className="tp-space-y-2">
    <p className={`tp-text-xs ${failed ? "tp-text-red-700" : "tp-text-gray-500"}`} role="status">{current === "COMPLETED" ? "تم قبول المستند واستخراج النص" : statusLabel(current)}</p>
    {current === "COMPLETED" && <DocumentGeneration documentId={documentId} programId={programId} notes={reason} hasContent={hasContent} />}
    {failed && <>
      <p className="tp-text-sm tp-text-red-700" role="alert">{documentErrorLabel(reason)}</p>
      <button type="button" onClick={retry} disabled={busy} className="brand-btn brand-btn-secondary">
        {requesting ? "جاري بدء المعالجة…" : "إعادة المعالجة"}
      </button>
    </>}
    {current === "PENDING" && <button type="button" onClick={retry} disabled={busy} className="brand-btn brand-btn-secondary">بدء المعالجة</button>}
    {current === "PROCESSING" && <>
      <p className="tp-text-xs tp-text-gray-500">{pollExpired ? "لم يُؤكد اكتمال المعالجة. حدّث الحالة للتحقق من تقدمها."
        : "جاري التحقق من الملف واستخراج نصه…"}</p>
      {connectionError && <p role="alert" className="tp-text-sm tp-text-red-700">{connectionError}</p>}
      <button type="button" className="brand-btn brand-btn-secondary" disabled={requesting} onClick={() => {
        setPollExpired(false); setPollCycle(cycle => cycle + 1); router.refresh();
      }}>تحديث الحالة</button>
    </>}
  </div>;
}
