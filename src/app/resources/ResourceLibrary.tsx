"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { type Category, type ResourceItem, formatSize, resourceMimeTypes } from "@/lib/resources/types";

async function mutate(body: unknown): Promise<Record<string, string>> {
  const response = await fetch("/api/resources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  let data; try { data = await response.json(); } catch { throw new Error("تعذّرت قراءة الاستجابة؛ تحقق من الاتصال وأعد المحاولة."); }
  if (!response.ok) throw new Error(data.error); return data;
}
export default function ResourceLibrary({ programId, programTitle, categories, items, programs = programId ? [{ id: programId, title: programTitle }] : [] }: { programId: string | null; programTitle: string; categories: Category[]; items: ResourceItem[]; programs?: { id: string; title: string }[] }) {
  const router = useRouter(); const [active, setActive] = useState("exams"); const [query, setQuery] = useState(""); const [trash, setTrash] = useState(false);
  const [modal, setModal] = useState<"resource" | "category" | null>(null); const [title, setTitle] = useState(""); const [category, setCategory] = useState("exams"); const [file, setFile] = useState<File | null>(null);
  const [targetProgram, setTargetProgram] = useState(programId ?? programs[0]?.id ?? "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [progress, setProgress] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null); const openerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (modal && !dialogRef.current?.open) dialogRef.current?.showModal(); }, [modal]);
  function open(type: "resource" | "category", button: HTMLButtonElement) { openerRef.current = button; setTitle(""); setFile(null); setTargetProgram(categories.find(c => c.key === active)?.programId ?? programId ?? programs[0]?.id ?? ""); setCategory(active === "all" ? "exams" : active); setError(""); setModal(type); }
  function close() { dialogRef.current?.close(); setModal(null); openerRef.current?.focus(); }
  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(""); setNotice(""); setProgress(0);
    try {
      if (modal === "category") await mutate({ mode: "category", programId: targetProgram, name: title });
      else {
        if (!file) throw new Error("اختر الملف الأصلي لإضافته إلى المكتبة.");
        const reserved = await mutate({ mode: "reserve", input: { programId: targetProgram, categoryKey: category, title, fileName: file.name, sizeBytes: file.size } });
        if (reserved.mode === "blob") {
          const { upload } = await import("@vercel/blob/client");
          const result = await upload(reserved.pathname, file, { access: "private", contentType: reserved.mimeType, handleUploadUrl: "/api/resources/upload-url", clientPayload: JSON.stringify({ id: reserved.id }), multipart: file.size > 5 * 1024 * 1024, onUploadProgress: event => setProgress(Math.round(event.percentage)) });
          await mutate({ mode: "complete", id: reserved.id, url: result.url });
        } else {
          const form = new FormData(); form.set("id", reserved.id); form.set("file", file);
          const response = await fetch("/api/resources/upload", { method: "POST", body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error);
        }
      }
      setNotice(modal === "category" ? "تم حفظ القسم الجديد." : "تم رفع المورد وحفظه في المكتبة."); close(); router.refresh();
    } catch(e) { setError(e instanceof Error ? e.message : "تعذّر الحفظ."); } finally { setBusy(false); }
  }
  async function manage(item: ResourceItem, action: "delete" | "restore" | "rename") {
    let newTitle: string | null = null;
    if (action === "delete" && !window.confirm("نقل المورد إلى المحذوفات؟ يمكنك استعادته لاحقًا.")) return;
    if (action === "rename") { newTitle = window.prompt("عنوان المورد", item.title); if (newTitle === null) return; }
    setBusy(true); setError(""); setNotice("");
    try { await mutate({ mode: "manage", id: item.id, action, ...(newTitle !== null ? { title: newTitle } : {}) }); router.refresh(); setNotice("تم حفظ التغيير."); }
    catch(e) { setError(e instanceof Error ? e.message : "تعذّر الحفظ."); } finally { setBusy(false); }
  }
  const available = items.filter(i => Boolean(i.archived) === trash);
  const programName = (id?: string) => programs.find(p => p.id === id)?.title;
  const filtered = available.filter(i => (active === "all" || i.categoryKey === active) && `${i.title} ${i.detail ?? ""} ${programName(i.programId) ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const current = categories.find(c => c.key === active);
  return <div className="em-stack">
    <header className="em-glass em-pad rl-header"><div><h1>مكتبة الموارد الرقمية الشاملة</h1><p className="em-muted">{programTitle} · الامتحانات والفيديوهات والعروض والوثائق والنتائج والمهام</p></div><div className="em-actions"><button className="em-button" disabled={busy} onClick={e => open("resource", e.currentTarget)}>+ إضافة مورد جديد للمكتبة</button><button className="em-button em-secondary" disabled={busy} onClick={e => open("category", e.currentTarget)}>+ إضافة قسم</button></div></header>
    <label className="rl-search"><span>🔍 البحث في المكتبة</span><input className="em-share" type="search" placeholder="ابحث عن ملف أو مستند…" value={query} onChange={e => { setQuery(e.target.value); setActive("all"); }}/></label>
    <div className="em-tabs"><button className={!trash ? "active" : ""} onClick={() => setTrash(false)}>الموارد النشطة</button><button className={trash ? "active" : ""} onClick={() => setTrash(true)}>المحذوفات ({items.filter(i => i.archived).length})</button></div>
    {error && !modal && <p role="alert" className="em-error">{error}</p>}{notice && <p role="status" className="em-correct">{notice}</p>}
    <div className="rl-layout"><nav className="rl-categories" aria-label="أقسام المكتبة"><h2>أقسام المكتبة</h2><button className={active === "all" ? "active" : ""} onClick={() => setActive("all")} aria-pressed={active === "all"}><span>📚 جميع الموارد</span><span>{available.length}</span></button>{categories.map(c => <button key={c.key} className={active === c.key ? "active" : ""} onClick={() => setActive(c.key)} aria-pressed={active === c.key}><span>{c.icon} {c.name}</span><span>{available.filter(i => i.categoryKey === c.key).length}</span></button>)}</nav>
      <section className="em-glass em-pad em-stack" aria-label="موارد القسم"><header className="rl-section-heading"><h2>{current ? `${current.icon} ${current.name}` : "جميع الموارد"}</h2><span className="em-muted">{filtered.length} مورد</span></header><div className="rl-grid">{filtered.map(item => <article className="rl-card" key={`${item.kind}-${item.id}`}><div><h3>{item.title}</h3>{!programId && programName(item.programId) && <p className="em-kicker">{programName(item.programId)}</p>}<p className="em-muted">{new Date(item.date).toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}{item.sizeBytes !== undefined && ` · ${formatSize(item.sizeBytes)}`}</p>{item.detail && <p className="em-muted">{item.detail}</p>}</div><div className="em-actions rl-card-actions">
        {!item.archived && <><a className="em-button em-secondary" href={item.previewUrl}>استعراض / معاينة</a>{item.downloadUrl && <a className="em-button em-secondary" href={item.downloadUrl}>تحميل{item.kind === "video" ? " التفريغ" : ""}</a>}</>}
        {item.kind === "file" && (item.archived ? <button className="em-button em-secondary" disabled={busy} onClick={() => manage(item, "restore")}>استعادة</button> : <><button className="em-button em-secondary" disabled={busy} onClick={() => manage(item, "rename")}>تعديل العنوان</button><button className="em-button em-secondary" disabled={busy} onClick={() => manage(item, "delete")}>حذف</button></>)}
      </div></article>)}</div>{!filtered.length && <p className="rl-empty">لا توجد موارد مطابقة في هذا القسم.{trash ? " تظهر هنا الملفات التي حُذفت من المكتبة ويمكن استعادتها." : " أضف ملفًا أو جهّز المحتوى في البرنامج."}</p>}<p className="em-muted">المحاضرات والامتحانات والفيديوهات والنتائج مرتبطة بأقسامها الأصلية؛ يمكنك إدارة محتواها من زر الاستعراض.</p></section>
    </div>
    {modal && <dialog ref={dialogRef} className="rl-dialog em-glass em-pad" aria-labelledby="resource-dialog-title" onCancel={e => { e.preventDefault(); if (!busy) close(); }}><h2 id="resource-dialog-title">{modal === "category" ? "إضافة قسم جديد" : "إضافة مورد جديد للمكتبة"}</h2><form onSubmit={save} className="em-stack"><label>العنوان<input autoFocus className="em-share" required minLength={3} maxLength={160} value={title} onChange={e => setTitle(e.target.value)} disabled={busy}/></label>
      {!programId && <label>البرنامج المستهدف<select className="em-share" value={targetProgram} required disabled={busy} onChange={e => { setTargetProgram(e.target.value); setCategory("exams"); }}>{programs.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label>}
      {modal === "resource" && <><label>القسم المستهدف<select className="em-share" value={category} onChange={e => setCategory(e.target.value)} disabled={busy}>{categories.filter(c => !c.programId || c.programId === targetProgram).map(c => <option key={c.key} value={c.key}>{c.name}</option>)}</select></label><label>الملف الأصلي<input type="file" required accept={Object.keys(resourceMimeTypes).map(k => `.${k}`).join(",")} disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)}/></label><p className="em-muted">PDF، Word، PowerPoint، Excel، TXT حتى ٣٠ MB؛ MP4 وWebM حتى ٥١٢ MB. إضافة ملف هنا لا تُدخل محتواه تلقائيًا في توليد الأسئلة.</p></>}
      {busy && <p role="status">{progress ? `رفع الملف: ${progress}٪` : "جارٍ الحفظ…"}</p>}{error && <p role="alert" className="em-error">{error}</p>}<div className="em-actions"><button className="em-button" disabled={busy}>{busy ? "جارٍ الحفظ…" : "حفظ وإضافة"}</button><button type="button" className="em-button em-secondary" disabled={busy} onClick={close}>إلغاء</button></div>
    </form></dialog>}
  </div>;
}
