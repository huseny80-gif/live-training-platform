import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { recoverMaterialJobs } from "@/lib/exam-material/service";
import { materialError } from "@/lib/exam-material/messages";
import type { Material, Guide, SourcePage } from "@/lib/exam-material/grounding";
import { studentMaterial } from "@/lib/exam-material/grounding";
import { SummaryView, ConceptView, CitationView } from "./MaterialView";
import { GenerationControls, PublishControls } from "./AdminControls";
import "./exam-material.css";

export const dynamic = "force-dynamic";
export default async function ExamMaterialPage({ searchParams }: { searchParams: Promise<{ programId?: string; batchId?: string; tab?: string }> }) {
  const user = await auth(); if (!user?.user?.id) redirect("/login");
  const query = await searchParams;
  const programs = await prisma.trainingProgram.findMany({ where: { instructorId: user.user.id }, select: { id: true, title: true }, orderBy: { createdAt: "desc" } });
  const program = query.programId ? programs.find(p => p.id === query.programId) : programs[0];
  if (query.programId && !program) notFound();
  await recoverMaterialJobs(user.user.id);
  const lectures = program ? await prisma.trainingDocument.findMany({ where: { programId: program.id, archivedAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, extractionStatus: true, pages: { select: { extractionMethod: true, extractionStatus: true, extractedText: true } } } }) : [];
  const archive = program ? await prisma.examMaterialBatch.findMany({ where: { programId: program.id }, select: { id: true, createdAt: true, status: true, publishedAt: true }, orderBy: { createdAt: "desc" } }) : [];
  const batchId = query.batchId ?? archive[0]?.id;
  const batch = batchId && program ? await prisma.examMaterialBatch.findFirst({ where: { id: batchId, programId: program.id } }) : null;
  if (query.batchId && !batch) notFound();
  const content = batch?.content as unknown as Material | null;
  const guide = batch?.instructorGuide as unknown as Guide | null;
  const tabs = [["summary", "الملخص"], ["map", "خريطة المفاهيم"], ["quiz", "الاختبار"], ["guide", "دليل المناقشة — للمدير"]];
  const tab = tabs.some(([id]) => id === query.tab) ? query.tab : "summary";
  const url = (id: string, nextTab = "summary") => `/exam-material?${new URLSearchParams({ programId: program!.id, batchId: id, tab: nextTab })}`;
  return <main dir="rtl" lang="ar" className="em-page"><div className="em-container em-stack">
    <header className="em-hero"><span className="em-kicker">منصة الحقيبة التدريبية</span><h1>المادة الامتحانية</h1><p>من نص المحاضرة إلى مراجعة موثقة، وتقييم يكشف مواضع الحاجة إلى التعلم.</p><Link href="/dashboard">→ لوحة المدرب</Link></header>
    <nav className="em-tabs" aria-label="البرامج">{programs.map(p => <Link className={p.id === program?.id ? "active" : ""} key={p.id} href={`/exam-material?programId=${p.id}`}>{p.title}</Link>)}</nav>
    {!program && <p className="em-glass em-pad">أنشئ برنامجًا وارفع محاضراته أولاً.</p>}
    {program && <Link className="em-button em-secondary" href={`/programs/${program.id}/lectures`}>إدارة المحاضرات: إضافة، تعديل، حذف</Link>}
    {program && <GenerationControls key={program.id} programId={program.id} generating={archive.some(a => a.status === "GENERATING")} lectures={lectures.map(l => ({ id: l.id, fileName: l.fileName, pages: l.pages.length, eligible: l.extractionStatus === "COMPLETED" && l.pages.length > 0 && l.pages.every(p => p.extractionMethod === "NATIVE_TEXT" && p.extractionStatus === "COMPLETED") && l.pages.some(p => p.extractedText?.trim()) }))}/>}
    <section className="em-stack"><h2>أرشيف عمليات التوليد</h2><nav className="em-tabs em-archive" aria-label="عمليات التوليد المحفوظة">
      {archive.map((a, i) => <Link aria-current={a.id === batch?.id ? "page" : undefined} className={a.id === batch?.id ? "active" : ""} key={a.id} href={url(a.id)}>المادة {archive.length - i} · {a.createdAt.toLocaleString("ar-IQ", { timeZone: "Asia/Baghdad" })}<small>{a.status === "GENERATING" ? "جارٍ التوليد" : a.status === "FAILED" ? "تعذّر التوليد" : a.publishedAt ? "منشورة" : "جاهزة للمراجعة"}</small></Link>)}
    </nav>{archive.length === 0 && <p className="em-muted">ستظهر هنا كل عملية توليد جديدة مع ملخصها وخريطتها واختبارها.</p>}</section>
    {batch?.status === "GENERATING" && <p className="em-glass em-pad" role="status">جارٍ اختيار المقاطع والتحقق الحرفي منها… يمكنك مغادرة الصفحة والعودة إلى الأرشيف.</p>}
    {batch?.status === "FAILED" && <p className="em-error em-glass em-pad" role="alert">{materialError[batch.errorCode ?? ""] ?? materialError.GENERATION_FAILED}</p>}
    {batch?.status === "READY" && content && <>
      <p className="em-muted">المحاضرات المحددة: {[...new Set((batch.sources as unknown as SourcePage[]).map(p => p.fileName))].join(" · ")}</p>
      <PublishControls id={batch.id} token={batch.shareToken}/>
      <nav className="em-tabs" aria-label="أقسام المادة">{tabs.map(([key, label]) => <Link aria-current={key === tab ? "page" : undefined} className={key === tab ? "active" : ""} key={key} href={url(batch.id, key)}>{label}</Link>)}</nav>
      {tab === "summary" && <SummaryView content={studentMaterial(content)} token={batch.shareToken}/>}
      {tab === "map" && <ConceptView content={studentMaterial(content)} token={batch.shareToken}/>}
      {tab === "quiz" && <section className="em-stack"><h2>مراجعة الاختبار وإجاباته</h2><p className="em-muted">أكمل النص المقتبس باختيار العبارة الأصلية. الخيارات مستخرجة من المحاضرات نفسها؛ راجع ملاءمة المشتتات قبل النشر.</p>{content.questions.map(q => <article className="em-glass em-pad em-stack" key={q.id}><h3>{q.prompt}</h3><ol>{q.options.map((o, i) => <li className={i === q.correctIndex ? "em-correct" : ""} key={i}>{o.text}{i === q.correctIndex && " ✓ الإجابة الأصلية"}<CitationView citation={o.citation} token={batch.shareToken}/></li>)}</ol><CitationView citation={q.citation} token={batch.shareToken}/></article>)}</section>}
      {tab === "guide" && <section className="em-stack"><h2>دليل المناقشة الذكي للمدير</h2><p className="em-muted">هذه مفاهيم اختارها الذكاء الاصطناعي للمناقشة الاستباقية؛ ليست تشخيصًا مثبتًا لضعف الطلاب. الأسئلة الحوارية قوالب للنقاش وليست حقائق إضافية.</p>{guide?.map((g, i) => <article className="em-glass em-pad em-stack" key={i}><span className="em-kicker">نقطة ضعف متوقعة تحتاج إلى التحقق في النقاش</span><h3>{g.focus}</h3><blockquote>{g.citation.text}</blockquote><p>{g.kind === "EXPLAIN" ? "كيف تشرح مفهوم" : g.kind === "COMPARE" ? "ما أوجه المقارنة المتعلقة بمفهوم" : "كيف تناقش تطبيق مفهوم"} «{g.focus}» بالاستناد إلى هذا المقطع؟</p><CitationView citation={g.citation} token={batch.shareToken}/></article>)}</section>}
    </>}
  </div></main>;
}
