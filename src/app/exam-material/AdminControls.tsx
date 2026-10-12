"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Lecture = { id: string; fileName: string; eligible: boolean; pages: number };
export function GenerationControls({ programId, lectures, generating }: { programId: string; lectures: Lecture[]; generating: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!generating) return; const timer = setInterval(() => router.refresh(), 4000); return () => clearInterval(timer); }, [generating, router]);
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/exam-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "generate", programId, documentIds: selected, count }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(`/exam-material?programId=${programId}&batchId=${data.id}`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر بدء التوليد."); }
    finally { setBusy(false); }
  }
  return <section className="em-glass em-pad em-stack" aria-label="اختيار المحاضرات">
    <div><span className="em-kicker">تحكم المدير</span><h2>اختر المادة التي سيُبنى عليها الاختبار</h2><p className="em-muted">تُقبل المحاضرات المكتملة ذات النص الأصلي فقط. كل عملية جديدة تبقى محفوظة في الأرشيف.</p></div>
    <fieldset disabled={busy || generating} className="em-lectures"><legend>المحاضرات</legend>
      {lectures.length === 0 && <p>ارفع المحاضرات إلى البرنامج واستخرج نصها أولاً.</p>}
      {lectures.map(l => <label key={l.id} className={`em-lecture ${!l.eligible ? "em-disabled" : ""}`}>
        <input type="checkbox" checked={selected.includes(l.id)} disabled={!l.eligible} onChange={e => setSelected(old => e.target.checked ? [...old, l.id] : old.filter(id => id !== l.id))}/>
        <span><strong>{l.fileName}</strong><small>{l.pages} صفحة · {l.eligible ? "جاهزة للتوليد الحرفي" : "تحتاج إلى استخراج نص أصلي مكتمل"}</small></span>
      </label>)}
    </fieldset>
    <label className="em-count">عدد الأسئلة <input type="number" min={Math.max(5, selected.length)} max={15} value={count} disabled={busy || generating} onChange={e => setCount(Number(e.target.value))}/></label>
    <div className="em-actions"><span>{selected.length} محاضرة محددة</span><button className="em-button" disabled={busy || generating || !selected.length || selected.length > 10 || selected.length > count || count < 5 || count > 15} onClick={generate}>{busy ? "بدء التوليد…" : generating ? "التوليد جارٍ — يتم تحديث الحالة تلقائيًا" : "توليد المحتوى الامتحاني"}</button></div>
    {error && <p className="em-error" role="alert">{error}</p>}
  </section>;
}
export function PublishControls({ id, token }: { id: string; token: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  async function publish() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/exam-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "publish", id, publish: !token }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); router.refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "تعذّر تغيير النشر."); } finally { setBusy(false); }
  }
  return <section className="em-glass em-pad em-stack"><h2>مراجعة المحتوى واعتماده</h2>
    <p>{token ? "المادة منشورة للمتدربين عبر الرابط. دليل المناقشة خاص بالمدير." : "راجع المقاطع والأسئلة قبل الاعتماد. لن يصبح المحتوى متاحًا للمتدربين إلا بعد نشره."}</p>
    <div className="em-actions"><button disabled={busy} className="em-button" onClick={publish}>{busy ? "جاري الحفظ…" : token ? "إلغاء النشر وإيقاف الرابط" : "اعتماد المحتوى ونشره للمتدربين"}</button>
      {token && <><a className="em-button em-secondary" href={`/study/${token}`} target="_blank" rel="noreferrer">فتح نسخة المتدرب</a><button className="em-button em-secondary" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/study/${token}`); setCopied(true); } catch { setError("انسخ الرابط من حقل الرابط أدناه."); } }}>{copied ? "تم نسخ الرابط" : "نسخ رابط المتدرب"}</button></>}
    </div>{token && <input className="em-share" aria-label="رابط المتدرب" readOnly value={`/study/${token}`} onFocus={e => e.target.select()} dir="ltr"/>}
    {error && <p role="alert" className="em-error">{error}</p>}
  </section>;
}
