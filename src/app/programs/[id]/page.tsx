import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getProgram, deleteProgram } from "@/app/actions/programs";
import Link from "next/link";
import DocumentUpload from "./DocumentUpload";
import LanguageToggle from "@/components/LanguageToggle";
import { brand } from "@/lib/brand";
import { deleteDocument, renameDocument } from "@/app/actions/documents";
import { deleteLiveSession, deleteAllProgramSessions } from "@/app/actions/sessions";
import RefreshButton from "@/components/RefreshButton";
import ShareSession from "@/components/ShareSession";

const STATUS_AR: Record<string,string> = { DRAFT:"مسودة", ACTIVE:"نشط", ARCHIVED:"مؤرشف" };
const EXTRACTION_AR: Record<string,string> = { PENDING:"بانتظار المعالجة", PROCESSING:"جارٍ التحليل", COMPLETED:"تم تحليل المحتوى", OCR_REQUIRED:"يحتاج معالجة صور", FAILED:"فشل التحليل" };

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  let program: any;
  try { program = await getProgram(id); } catch(e:unknown) {
    const msg=e instanceof Error?e.message:""; if(msg==="NOT_FOUND"||msg==="FORBIDDEN") notFound(); throw e;
  }
  if(!program) notFound();
  const totalQuestions=program.days.reduce((s:number,d:any)=>s+d._count.questions,0);
  return <main className="dlp-simple-page">
    <header className="dlp-program-header">
      <div><Link href="/dashboard">← الرئيسية</Link><strong>{brand.nameAr}</strong></div>
      <div className="dlp-header-tools"><RefreshButton/><LanguageToggle/></div>
    </header>
    <div className="dlp-program-container">
      <section className="dlp-program-titlebar">
        <div><span className="dlp-badge active">{STATUS_AR[program.status]??program.status}</span><h1>{program.title}</h1>{program.description&&<p>{program.description}</p>}</div>
        <div className="dlp-program-actions"><Link href={`/programs/${id}/manage`}>إدارة المحتوى</Link><Link href={`/programs/${id}/edit`}>تعديل البرنامج</Link></div>
      </section>
      <nav className="dlp-tabs">
        <Link href={`/programs/${id}`} className="active">نظرة عامة</Link>
        <a href="#documents">المادة المرفقة</a>
        <a href="#days">الأيام التدريبية</a>
        <Link href={`/programs/${id}/final-questions`}>الأسئلة النهائية</Link>
        <a href="#sessions">الجلسات</a>
      </nav>
      <section className="dlp-stats">
        <div className="brand-card dlp-stat"><p className="dlp-stat-value">{program._count.days}</p><p className="dlp-stat-label">أيام تدريبية</p></div>
        <div className="brand-card dlp-stat"><p className="dlp-stat-value">{totalQuestions}</p><p className="dlp-stat-label">سؤال تدريبي</p></div>
        <div className="brand-card dlp-stat"><p className="dlp-stat-value">{program._count.sessions}</p><p className="dlp-stat-label">جلسة</p></div>
        <div className="brand-card dlp-stat"><p className="dlp-stat-value">30</p><p className="dlp-stat-label">سؤال نهائي مستهدف</p></div>
      </section>
      <section id="documents" className="brand-card dlp-program-section"><h2>المادة التدريبية المرفقة</h2><p>تُراجع المادة وتُستخلص الأسئلة من محتواها حصراً.</p>
        {program.documents?.length>0?program.documents.slice(0,1).map((doc:any)=><div className="dlp-material-manager" key={doc.id}><div className="dlp-doc-row"><strong>{doc.fileName}</strong><span>{doc.pageCount??"—"} صفحة</span><span>{EXTRACTION_AR[doc.extractionStatus]??doc.extractionStatus}</span></div><div className="dlp-inline-actions"><form action={async(formData:FormData)=>{"use server";await renameDocument(doc.id,String(formData.get("fileName")??""));}}><input name="fileName" defaultValue={doc.fileName}/><button>تعديل الاسم</button></form><form action={async()=>{"use server";await deleteDocument(doc.id);}}><button className="dlp-danger-button" type="submit">حذف المادة</button></form></div></div>):<p>لا يوجد ملف مادة معتمد بعد.</p>}
        <p className="dlp-settings-note">المنصة تعرض ملف المادة المعتمد فقط. لحماية المراجع، احذف المادة الحالية قبل رفع بديل جديد.</p><DocumentUpload programId={id}/>
      </section>
      <section id="days" className="brand-card dlp-program-section"><div className="dlp-section-head"><div><h2>الأيام التدريبية</h2><p>10 أيام × 5 أسئلة مستخلصة من المادة = 50 سؤالاً.</p></div><Link className="brand-button-primary dlp-new-button" href={`/programs/${id}/days`}>+ إضافة يوم</Link></div>
        <div className="dlp-days-list">{program.days.map((day:any)=><Link key={day.id} href={`/programs/${id}/days/${day.id}`} className="dlp-day-row"><span>اليوم {day.dayNumber}</span><strong>{day.title}</strong><em>{day._count.questions} / 5 أسئلة</em></Link>)}</div>
      </section>
      <section className="brand-card dlp-final-cta"><div><h2>الأسئلة النهائية</h2><p>ملخص شامل + 10 MCQ + 20 صح/خطأ + Google Apps Script.</p></div><Link className="brand-button-primary dlp-new-button" href={`/programs/${id}/final-questions`}>فتح الأسئلة النهائية</Link></section>
      <section id="sessions" className="brand-card dlp-program-section"><div className="dlp-section-head"><div><h2>إدارة الجلسات</h2><p>يمكن حذف الجلسات المنتهية أو المسودات. يجب إنهاء الجلسة النشطة قبل حذفها.</p></div>{program.sessions.length>0&&<form action={async()=>{"use server";await deleteAllProgramSessions(id);}}><button className="dlp-danger-button" type="submit">حذف جميع الجلسات</button></form>}</div>{program.sessions.length===0?<p>لا توجد جلسات بعد.</p>:program.sessions.map((s:any)=><div className="dlp-doc-row" key={s.id}><strong>{s.sessionCode}</strong><span>{s.status}</span><ShareSession code={s.sessionCode}/><form action={async()=>{"use server";await deleteLiveSession(s.id);}}><button className="dlp-danger-button" type="submit">حذف</button></form></div>)}</section>
      <form action={async()=>{"use server";const r=await deleteProgram(id);if(!r.ok)throw new Error(r.error);redirect("/dashboard");}}><button className="dlp-danger-button">حذف البرنامج</button></form>
    </div>
    <nav className="dlp-mobile-nav"><Link href="/dashboard" className="active">⌂<span>الرئيسية</span></Link><Link href={`/programs/${id}`}>▣<span>البرنامج</span></Link><Link href={`/programs/${id}/final-questions`}>✓<span>النهائي</span></Link><Link href="/settings">⚙<span>الإعدادات</span></Link></nav><div className="dlp-mobile-spacer"/>
  </main>;
}
