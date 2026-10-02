"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GenerationState } from "@/lib/ai/generation-state";
import { documentErrorLabel } from "@/lib/document-errors";
export interface FinalProgram { id: string; title: string; documents: { id: string; fileName: string }[]; questions: number; state: GenerationState }
export default function FinalGenerators({ programs }: { programs: FinalProgram[] }) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, GenerationState>>(() => Object.fromEntries(programs.map(p => [p.id, p.state])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [documents, setDocuments] = useState<Record<string, string>>(() => Object.fromEntries(programs.map(p => [p.id, p.documents[0]?.id ?? ""])));
  const [starting, setStarting] = useState<Record<string, boolean>>({});
  useEffect(() => { setStates(Object.fromEntries(programs.map(p => [p.id, p.state]))); }, [programs]);
  const processing = Object.keys(states).filter(id => states[id].status === "processing").sort().join(",");
  useEffect(() => {
    if (!processing) return;
    let cancelled = false; let attempts = 0;
    async function poll() {
      await Promise.all(processing.split(",").map(async id => {
        try {
          const response = await fetch(`/api/final-exam/status?programId=${encodeURIComponent(id)}`, { cache: "no-store" });
          if (response.redirected || response.status === 401) throw new Error("SESSION_EXPIRED");
          if (!response.ok) throw new Error("STATUS_UNAVAILABLE");
          const data = await response.json(); if (cancelled) return;
          setStates(s => ({ ...s, [id]: data.state })); setErrors(e => ({ ...e, [id]: "" }));
          if (data.state.status !== "processing") router.refresh();
        } catch (error) { if (!cancelled) setErrors(e => ({ ...e, [id]: documentErrorLabel(error instanceof Error ? error.message : "", "تعذّر متابعة التوليد. حدّث الحالة للتحقق.") })); }
      }));
      if (++attempts >= 120) { clearInterval(timer); if (!cancelled) setErrors(e => ({ ...e, ...Object.fromEntries(processing.split(",").map(id => [id, "لم يُؤكد اكتمال التوليد. حدّث الصفحة للتحقق."])) })); }
    }
    const timer = setInterval(poll, 4000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [processing, router]);
  async function generate(id: string) {
    setStarting(s => ({ ...s, [id]: true })); setErrors(e => ({ ...e, [id]: "" }));
    try {
      const response = await fetch("/api/final-exam/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: id, documentId: documents[id] }) });
      if (response.redirected || response.status === 401) throw new Error("SESSION_EXPIRED");
      const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "GENERATION_FAILED");
      setStates(s => ({ ...s, [id]: { status: "processing", completedDays: 0 } }));
    } catch (error) { setErrors(e => ({ ...e, [id]: documentErrorLabel(error instanceof Error ? error.message : "", "تعذّر بدء توليد الأسئلة النهائية. أعد المحاولة.") })); }
    finally { setStarting(s => ({ ...s, [id]: false })); }
  }
  const eligible = programs.filter(p => !p.questions && p.documents.length && states[p.id]?.status !== "processing" && !starting[p.id]);
  return <section className="tp-space-y-3"><h2>توليد الأسئلة النهائية للبرامج</h2>
    <p>ولّد 35 سؤالاً نهائياً لكل برنامج: 15 اختياراً من متعدد و20 صح/خطأ، تغطي كامل المادة التدريبية. تبقى الأسئلة اليومية مستقلة.</p>
    {programs.length > 1 && <button className="brand-btn brand-btn-primary" disabled={!eligible.length} onClick={() => { void Promise.all(eligible.map(p => generate(p.id))); }}>توليد الأسئلة النهائية لجميع البرامج الجاهزة</button>}
    {programs.map(p => {
      const state = states[p.id] ?? p.state;
      return <article className="platform-question" key={p.id} data-final-program={p.id}><h3>{p.title}</h3>
        <p>الأسئلة النهائية المحفوظة: {p.questions}</p>
        {!p.questions && <><label htmlFor={`final-doc-${p.id}`}>المستند المقبول</label><select id={`final-doc-${p.id}`} className="platform-input" value={documents[p.id] ?? ""} onChange={e => setDocuments(d => ({ ...d, [p.id]: e.target.value }))} disabled={state.status === "processing" || starting[p.id]}>
          {!p.documents.length && <option value="">لا يوجد مستند مقبول بعد</option>}{p.documents.map(d => <option key={d.id} value={d.id}>{d.fileName}</option>)}
        </select>
        {state.status === "processing" ? <p role="status">جاري توليد الأسئلة النهائية… اكتملت {state.completedDays * 5} من 35 سؤالاً.</p>
          : <button className="brand-btn brand-btn-primary" disabled={!p.documents.length || starting[p.id]} onClick={() => generate(p.id)}>{starting[p.id] ? "جاري بدء التوليد…" : state.status === "failed" ? "إعادة توليد الأسئلة النهائية" : "توليد الأسئلة النهائية"}</button>}
        </>}
        {state.status === "failed" && !p.questions && <p role="alert">{documentErrorLabel(state.error, "تعذّر توليد الأسئلة النهائية. يمكنك إعادة المحاولة.")}</p>}
        {errors[p.id] && <p role="alert">{errors[p.id]}</p>}
        {p.questions > 0 && <Link className="brand-btn brand-btn-secondary" href={`/questions?programId=${p.id}&scope=final`}>مراجعة الأسئلة النهائية وتعديلها واعتمادها</Link>}
        <Link className="brand-btn brand-btn-primary" href={`/google-forms?programId=${p.id}&scope=final`}>توليد Google Forms للأسئلة النهائية</Link>
        <Link className="brand-btn brand-btn-secondary" href={`/final-exam?programId=${p.id}`}>إعداد جلسة الاختبار النهائي</Link>
        {state.status === "processing" && <button className="brand-btn brand-btn-secondary" onClick={() => router.refresh()}>تحديث الحالة</button>}
      </article>;
    })}
  </section>;
}
