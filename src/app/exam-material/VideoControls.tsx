"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type VideoItem = { id: string; title: string; mediaUrl: string | null; archived: boolean; cues: number; duration: string; transcript: string };
export default function VideoControls({ programId, videos }: { programId: string; videos: VideoItem[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [id, setId] = useState<string | undefined>();
  const [title, setTitle] = useState(""); const [mediaUrl, setUrl] = useState(""); const [transcript, setTranscript] = useState("");
  const [reviewed, setReviewed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  function reset() { setId(undefined); setTitle(""); setUrl(""); setTranscript(""); setReviewed(false); formRef.current?.reset(); }
  async function send(body: unknown) {
    const response = await fetch("/api/exam-material/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error); router.refresh();
  }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await send({ programId, title, mediaUrl, transcript, sourceReviewed: reviewed, ...(id ? { id } : {}) }); reset(); }
    catch(e) { setError(e instanceof Error ? e.message : "تعذّر الحفظ."); } finally { setBusy(false); }
  }
  async function archive(video: VideoItem) {
    if (!video.archived && !window.confirm("حذف الفيديو من المصادر النشطة؟ ستبقى النسخ الامتحانية السابقة محفوظة ويمكن استعادة الفيديو.")) return;
    setBusy(true); setError("");
    try { await send({ mode: "archive", id: video.id, archived: !video.archived }); if (video.id === id) reset(); }
    catch(e) { setError(e instanceof Error ? e.message : "تعذّر الحفظ."); } finally { setBusy(false); }
  }
  return <details className="em-glass em-pad em-stack"><summary>إدارة الفيديوهات وتفريغها النصي</summary>
    <p className="em-muted">استورد SRT أو VTT وراجعه مقابل الصوت. يُولد المحتوى من التفريغ المحفوظ حصراً مع إحالة زمنية؛ رابط الفيديو وحده لا ينتج نصاً.</p>
    <form ref={formRef} className="em-stack" onSubmit={save}>
      <label>عنوان الفيديو<input className="em-share" value={title} onChange={e => setTitle(e.target.value)} required minLength={3} maxLength={120} disabled={busy}/></label>
      <label>رابط YouTube أو Vimeo (اختياري)<input className="em-share" type="url" dir="ltr" value={mediaUrl} onChange={e => { setUrl(e.target.value); setReviewed(false); }} maxLength={500} disabled={busy}/></label>
      <label>ملف التفريغ SRT / VTT<input type="file" accept=".srt,.vtt,text/vtt" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; if (!file) return;
        if (file.size > 480_000) { setError("الملف كبير؛ الحد الأقصى ١٢٠ ألف حرف."); e.target.value = ""; return; }
        try { const text = await file.text(); if (text.length > 120_000) throw new Error("الحد الأقصى ١٢٠ ألف حرف."); setTranscript(text); setReviewed(false); setError(""); } catch(e) { setError(e instanceof Error ? e.message : "تعذّرت قراءة الملف."); }
      }}/></label>
      <label>التفريغ النصي مع التوقيت<textarea className="em-share em-transcript" value={transcript} onChange={e => { setTranscript(e.target.value); setReviewed(false); }} rows={9} required maxLength={120_000} disabled={busy}/></label>
      <label><input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} disabled={busy}/> راجعت النص والتوقيت مقابل الفيديو وأؤكد أنه من المصدر دون إضافة.</label>
      <div className="em-actions"><button className="em-button" disabled={busy || !reviewed || !transcript.trim()}>{busy ? "جارٍ الحفظ…" : id ? "حفظ النسخة المحدّثة" : "إضافة الفيديو وتفريغه"}</button>{id && <button type="button" className="em-button em-secondary" disabled={busy} onClick={reset}>إلغاء التعديل</button>}</div>
    </form>
    {error && <p role="alert" className="em-error">{error}</p>}
    <div className="em-stack">{videos.map(video => <article className="em-lecture" key={video.id}><span><strong>{video.title}</strong><small>{video.cues} مقطعًا · {video.duration} · {video.archived ? "محذوف من المصادر النشطة" : "تفريغ معتمد من المدرب"}</small></span><div className="em-actions">
      {!video.archived && <button className="em-button em-secondary" disabled={busy} onClick={() => { setId(video.id); setTitle(video.title); setUrl(video.mediaUrl ?? ""); setTranscript(video.transcript); setReviewed(false); setError(""); formRef.current?.scrollIntoView({ block: "start" }); }}>تعديل</button>}
      <button className="em-button em-secondary" disabled={busy} onClick={() => archive(video)}>{video.archived ? "استعادة" : "حذف"}</button>
    </div></article>)}{!videos.length && <p className="em-muted">لم تُضف فيديوهات لهذا البرنامج بعد.</p>}</div>
  </details>;
}
