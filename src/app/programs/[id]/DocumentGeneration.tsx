"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { generationState } from "@/lib/ai/generation-state";
import { documentErrorLabel } from "@/lib/document-errors";

export default function DocumentGeneration({ documentId, programId, notes, hasContent }: {
  documentId: string; programId: string; notes: string | null; hasContent: boolean;
}) {
  const router = useRouter();
  const [currentNotes, setCurrentNotes] = useState(notes);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);
  const state = generationState(currentNotes);
  useEffect(() => { setCurrentNotes(notes); }, [notes]);
  useEffect(() => {
    if (state.status !== "processing") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function poll() {
      try {
        const response = await fetch(`/api/documents/status?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
        if (cancelled) return;
        if (response.status === 401 || response.status === 403 || (response.redirected && new URL(response.url).pathname === "/login")) {
          setError(documentErrorLabel("SESSION_EXPIRED")); return;
        }
        if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
        const data = await response.json();
        if (cancelled) return;
        if (typeof data.extractionNotes !== "string") throw new Error("INVALID_STATUS");
        setCurrentNotes(data.extractionNotes); setError(null);
        if (generationState(data.extractionNotes).status !== "processing") { router.refresh(); return; }
      } catch { if (!cancelled) setError("تعذّر متابعة التوليد. حدّث الحالة للتحقق من تقدم العملية."); }
      if (!cancelled && ++attempts < 120) timer = setTimeout(poll, 4000);
      else if (!cancelled) setError("لم يُؤكد اكتمال التوليد. حدّث الحالة للتحقق من النتيجة.");
    }
    timer = setTimeout(poll, 4000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [state.status, documentId, router, cycle]);

  async function generate() {
    setRequesting(true); setError(null);
    try {
      const response = await fetch("/api/documents/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, programId }),
      });
      if (response.redirected && new URL(response.url).pathname === "/login") throw new Error("SESSION_EXPIRED");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "GENERATION_FAILED");
      if (typeof data.notes === "string") setCurrentNotes(data.notes);
      const status = await fetch(`/api/documents/status?documentId=${encodeURIComponent(documentId)}`, { cache: "no-store" });
      if (!status.ok || status.redirected) throw new Error("STATUS_UNAVAILABLE");
      const progress = await status.json();
      setCurrentNotes(progress.extractionNotes);
      if (generationState(progress.extractionNotes).status !== "processing") router.refresh();
    } catch (failure) { setError(documentErrorLabel(failure instanceof Error ? failure.message : "GENERATION_FAILED", "تعذّر بدء التوليد أو متابعة حالته. حدّث الحالة ثم حاول مجدداً.")); }
    finally { setRequesting(false); }
  }
  return <div className="tp-space-y-2">
    {state.status === "completed" ? <p className="tp-text-sm tp-text-green-700" role="status">تم توليد {state.questions} سؤالاً موزعة على {state.days} أيام تدريبية.</p>
      : state.status === "processing" ? <>
        <p className="tp-text-sm tp-text-gray-600" role="status">{state.completedDays === 0 ? "جاري إعداد خطة الأيام وتوليد الأسئلة…" : `جاري التوليد… اكتملت أسئلة ${state.completedDays} من 10 أيام.`}</p>
        <button type="button" className="brand-btn brand-btn-secondary" onClick={() => { setCycle(value => value + 1); router.refresh(); }}>تحديث حالة التوليد</button>
      </> : hasContent ? <p className="tp-text-sm tp-text-gray-600">يحتوي البرنامج على محتوى محفوظ يمكنك مراجعته من إدارة المحتوى.</p>
      : <>
        <p className="tp-text-sm tp-text-gray-500">ولّد ٥٠ سؤالاً باللغة المحددة للبرنامج، موزعة على ١٠ أيام، من نص هذا المستند.</p>
        {state.status === "failed" && <p className="tp-text-sm tp-text-red-700" role="alert">{documentErrorLabel(state.error, "تعذّر توليد الأسئلة. يمكنك إعادة المحاولة.")}</p>}
        <button type="button" className="brand-btn brand-btn-primary" onClick={generate} disabled={requesting}>{requesting ? "جاري بدء التوليد…" : state.status === "failed" ? "إعادة توليد الأسئلة" : "توليد الأسئلة"}</button>
      </>}
    {error && <p className="tp-text-sm tp-text-red-700" role="alert">{error}</p>}
    {(state.status === "completed" || hasContent) && <Link className="brand-btn brand-btn-secondary" href={`/programs/${programId}/manage`}>مراجعة الأسئلة</Link>}
  </div>;
}
