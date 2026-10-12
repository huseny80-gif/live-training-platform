"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Lecture = { id: string; fileName: string; eligible: boolean; pages: number };
type Video = { id: string; title: string; duration: string; cues: number };
export function GenerationControls({ programId, lectures, videos = [], generating }: { programId: string; lectures: Lecture[]; videos?: Video[]; generating: boolean }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const total = selected.length + selectedVideos.length;
  const [countText, setCountText] = useState("10");
  const count = Number(countText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!generating) return; const timer = setInterval(() => router.refresh(), 4000); return () => clearInterval(timer); }, [generating, router]);
  async function generate() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/exam-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "generate", programId, documentIds: selected, videoIds: selectedVideos, count }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(`/exam-material?programId=${programId}&batchId=${data.id}`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "تعذّر بدء التوليد."); }
    finally { setBusy(false); }
  }
  return <section className="em-glass em-pad em-stack" aria-label="اختيار المحاضرات">
    <div><span className="em-kicker">تحكم المدير</span><h2>إدارة ومزامنة المحتوى: النصوص والفيديو</h2><p className="em-muted">اختر المحاضرات وتفريغات الفيديو المعتمدة. يبقى كل اقتباس مرتبطًا بصفحته أو توقيته، وكل عملية محفوظة في الأرشيف.</p></div>
    <div className="em-source-grid">
    <fieldset disabled={busy || generating} className="em-lectures"><legend>المحاضرات</legend>
      {lectures.length === 0 && <p>ارفع المحاضرات إلى البرنامج واستخرج نصها أولاً.</p>}
      {lectures.map(l => <label key={l.id} className={`em-lecture ${!l.eligible ? "em-disabled" : ""}`}>
        <input type="checkbox" checked={selected.includes(l.id)} disabled={!l.eligible} onChange={e => setSelected(old => e.target.checked ? [...old, l.id] : old.filter(id => id !== l.id))}/>
        <span><strong>{l.fileName}</strong><small>{l.pages} صفحة · {l.eligible ? "جاهزة للتوليد الحرفي" : "تحتاج إلى استخراج نص أصلي مكتمل"}</small></span>
      </label>)}
    </fieldset>
    <fieldset disabled={busy || generating} className="em-lectures"><legend>مقاطع الفيديو التدريبية</legend>{!videos.length && <p className="em-muted">أضف تفريغ فيديو معتمدًا من قسم إدارة الفيديوهات أدناه.</p>}{videos.map(v => <label className="em-lecture" key={v.id}><input type="checkbox" checked={selectedVideos.includes(v.id)} onChange={e => setSelectedVideos(old => e.target.checked ? [...old, v.id] : old.filter(id => id !== v.id))}/><span><strong>{v.title}</strong><small>{v.cues} مقطعًا · {v.duration} · تفريغ معتمد</small></span></label>)}</fieldset>
    </div>
    <label className="em-count">عدد الأسئلة <input type="number" min={Math.max(1, total)} max={50} step={1} value={countText} inputMode="numeric" aria-label="عدد الأسئلة" disabled={busy || generating} onChange={e => setCountText(e.target.value)}/></label>
    <p className="em-muted">يمكنك اختيار ١–٥٠ سؤالًا ومن مصدر واحد إلى ١٠ مصادر. العدد الأدنى يساوي عدد المصادر المختارة، والتوليد يتطلب نصًا مناسبًا كافيًا.</p>
    <div className="em-actions"><span>{selected.length} محاضرة · {selectedVideos.length} فيديو محدد</span><button className="em-button" disabled={busy || generating || !total || total > 10 || total > count || !Number.isInteger(count) || count < 1 || count > 50} onClick={generate}>{busy ? "بدء التوليد…" : generating ? "التوليد جارٍ — يتم تحديث الحالة تلقائيًا" : "توليد المحتوى الامتحاني"}</button></div>
    {error && <p className="em-error" role="alert">{error}</p>}
  </section>;
}
export function PublishControls({ id, token, requiresSourceReview = false, sourceReviewed = false }: { id: string; token: string | null; requiresSourceReview?: boolean; sourceReviewed?: boolean }) {
  const router = useRouter();
  const [reviewed, setReviewed] = useState(sourceReviewed);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [copied, setCopied] = useState(false);
  async function publish() {
    setBusy(true); setError("");
    try { const response = await fetch("/api/exam-material", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "publish", id, publish: !token, sourceReviewed: reviewed }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error); router.refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "تعذّر تغيير النشر."); } finally { setBusy(false); }
  }
  return <section className="em-glass em-pad em-stack"><h2>مراجعة المحتوى واعتماده</h2>
    <p>{token ? "المادة منشورة للمتدربين عبر الرابط. دليل المناقشة خاص بالمدير." : "راجع المقاطع والأسئلة قبل الاعتماد. لن يصبح المحتوى متاحًا للمتدربين إلا بعد نشره."}</p>
    {requiresSourceReview && !token && <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)}/> راجعت النص والأسئلة المستخرجة من صور PDF مقابل المحاضرة الأصلية وأعتمد صحتها.</label>}
    <div className="em-actions"><button disabled={busy || (!token && requiresSourceReview && !reviewed)} className="em-button" onClick={publish}>{busy ? "جاري الحفظ…" : token ? "إلغاء النشر وإيقاف الرابط" : "اعتماد المحتوى ونشره للمتدربين"}</button>
      {token && <><a className="em-button em-secondary" href={`/study/${token}`} target="_blank" rel="noreferrer">فتح نسخة المتدرب</a><button className="em-button em-secondary" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/study/${token}`); setCopied(true); } catch { setError("انسخ الرابط من حقل الرابط أدناه."); } }}>{copied ? "تم نسخ الرابط" : "نسخ رابط المتدرب"}</button></>}
    </div>{token && <input className="em-share" aria-label="رابط المتدرب" readOnly value={`/study/${token}`} onFocus={e => e.target.select()} dir="ltr"/>}
    {error && <p role="alert" className="em-error">{error}</p>}
  </section>;
}
