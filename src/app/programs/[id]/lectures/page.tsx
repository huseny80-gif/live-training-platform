import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { listDocuments, getDocument } from "@/app/actions/documents";
import { recoverStaleProgramDocuments } from "@/lib/extraction/recovery";
import { recoverGenerationJobs } from "@/lib/ai/jobs";
import { statusLabel } from "@/lib/labels";
import DocumentUpload from "../DocumentUpload";
import DocumentProcessing from "../DocumentProcessing";
import LectureControls from "./LectureControls";
import "@/app/exam-material/exam-material.css";
import "./lectures.css";
export const dynamic = "force-dynamic";
export default async function LecturesPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ documentId?: string; archived?: string }>;
}) {
  const user = await auth(); if (!user?.user?.id) redirect("/login");
  const { id } = await params; const query = await searchParams;
  const program = await prisma.trainingProgram.findFirst({ where: { id, instructorId: user.user.id }, select: { title: true, _count: { select: { sessions: true, days: true } } } });
  if (!program) notFound();
  await recoverStaleProgramDocuments(id, user.user.id);
  await recoverGenerationJobs(user.user.id, { programId: id });
  const documents = await listDocuments(id, true);
  const questionCount = await prisma.question.count({ where: { programId: id, day: { dayNumber: { gt: 0 } } } });
  const archived = query.archived === "true";
  const visible = documents.filter(d => Boolean(d.archivedAt) === archived);
  const selectedId = query.documentId ?? visible[0]?.id;
  let doc = null;
  if (selectedId) {
    try { doc = await getDocument(selectedId); }
    catch (error) { if (error instanceof Error && error.message === "NOT_FOUND") notFound(); throw error; }
  }
  if (doc && doc.programId !== id) notFound();
  return <main className="em-page" dir="rtl" lang="ar"><div className="em-container em-stack">
    <header className="em-hero"><span className="em-kicker">إدارة المحتوى التدريبي</span><h1>محاضرات {program.title}</h1><p>أضف المحاضرات، وحدّث ملفاتها وأسماءها، وراجع نصها أو احذفها من المحتوى النشط.</p></header>
    <nav className="em-tabs"><Link href={`/programs/${id}`}>→ البرنامج</Link><Link href={`/programs/${id}/manage`}>الأيام والأسئلة</Link><Link href={`/exam-material?programId=${id}`}>المادة الامتحانية</Link></nav>
    <div className="lecture-upload"><DocumentUpload programId={id}/></div>
    <nav className="em-tabs" aria-label="حالة المحاضرات"><Link className={!archived ? "active" : ""} href={`/programs/${id}/lectures`}>المحاضرات النشطة ({documents.filter(d => !d.archivedAt).length})</Link><Link className={archived ? "active" : ""} href={`/programs/${id}/lectures?archived=true`}>المحذوفة والنسخ السابقة ({documents.filter(d => d.archivedAt).length})</Link></nav>
    <div className="lecture-layout"><nav className="em-stack" aria-label="اختيار المحاضرة">{visible.map(d => <Link key={d.id} className={`em-glass em-pad lecture-link ${d.id === doc?.id ? "selected" : ""}`} href={`/programs/${id}/lectures?documentId=${d.id}${archived ? "&archived=true" : ""}`}><strong>{d.fileName}</strong><small>{d.pageCount ?? "—"} صفحة · {statusLabel(d.extractionStatus)}</small></Link>)}{!visible.length && <p className="em-muted">لا توجد محاضرات في هذا القسم.</p>}</nav>
      {doc && <section className="em-glass em-pad em-stack"><h2 className="lecture-title">{doc.fileName}</h2><p>{doc.pageCount ?? "—"} صفحة · {doc.archivedAt ? "محفوظة في الأرشيف" : "محاضرة نشطة"}</p>
        <LectureControls key={`${doc.id}:${Boolean(doc.archivedAt)}`} programId={id} document={{ id: doc.id, fileName: doc.fileName, archived: Boolean(doc.archivedAt), busy: doc.extractionStatus === "PROCESSING" || Boolean(doc.extractionNotes?.startsWith("GENERATION_PROCESSING:")) }}/>
        {!doc.archivedAt && <DocumentProcessing documentId={doc.id} programId={id} status={doc.extractionStatus} notes={doc.extractionNotes} hasContent={questionCount > 0 || program._count.sessions > 0}/>}
        <h3>نص المحاضرة المستخرج</h3><p className="em-muted">لتغيير المحتوى، ارفع نسخة PDF محدّثة. يبقى النص هنا مطابقًا للمصدر.</p>
        {doc.pages.map(p => <details className="em-glass em-pad" key={p.id}><summary>صفحة {p.pageNumber}{p.title ? ` — ${p.title}` : ""}</summary><p className="lecture-text">{p.extractedText || "لم يُستخرج نص لهذه الصفحة بعد."}</p></details>)}
        {!doc.pages.length && <p className="em-muted">لم تُجهّز صفحات هذه المحاضرة بعد.</p>}
      </section>}
    </div>
  </div></main>;
}
