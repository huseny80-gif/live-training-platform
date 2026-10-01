import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getProgram, deleteProgram } from "@/app/actions/programs";
import Link from "next/link";
import DocumentUpload from "./DocumentUpload";
import DeleteDocumentButton from "./DeleteDocumentButton";
import { brand } from "@/lib/brand";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  ARCHIVED: "مؤرشف",
  APPROVED: "معتمد",
  PAUSED: "موقوف مؤقتًا",
  ENDED: "منتهي",
};

const EXTRACTION_LABEL: Record<string, string> = {
  PENDING: "بانتظار المعالجة",
  PROCESSING: "جارٍ التحليل",
  COMPLETED: "تم التحليل",
  OCR_REQUIRED: "يحتاج OCR",
  FAILED: "فشل التحليل",
};

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  let program;
  try {
    program = await getProgram(id);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "NOT_FOUND" || message === "FORBIDDEN") notFound();
    throw error;
  }
  if (!program) notFound();

  const totalQuestions = program.days.reduce((sum, day) => sum + day._count.questions, 0);

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div>
          <Link href="/dashboard">← الرئيسية</Link>
          <span>/</span>
          <strong>{brand.nameAr}</strong>
        </div>
        <div className="dlp-program-actions">
          <Link href={`/programs/${id}/manage`}>إدارة المحتوى</Link>
          <Link href={`/programs/${id}/final-questions`}>الأسئلة النهائية</Link>
          <Link href={`/programs/${id}/google-forms`}>Google Forms</Link>
          <Link href={`/programs/${id}/edit`}>تعديل البرنامج</Link>
        </div>
      </header>

      <div className="dlp-program-container">
        <section className="dlp-program-titlebar">
          <div>
            <span className={`dlp-badge ${program.status === "ACTIVE" ? "active" : program.status === "DRAFT" ? "draft" : "archived"}`}>
              {STATUS_LABEL[program.status] ?? program.status}
            </span>
            <h1>{program.title}</h1>
            {program.description ? <p>{program.description}</p> : null}
          </div>
        </section>

        <section className="dlp-stats">
          <div className="brand-card dlp-stat"><p className="dlp-stat-value">{program._count.days}</p><p className="dlp-stat-label">الأيام التدريبية</p></div>
          <div className="brand-card dlp-stat"><p className="dlp-stat-value">{totalQuestions}</p><p className="dlp-stat-label">الأسئلة</p></div>
          <div className="brand-card dlp-stat"><p className="dlp-stat-value">{program._count.sessions}</p><p className="dlp-stat-label">الجلسات</p></div>
          <div className="brand-card dlp-stat"><p className="dlp-stat-value">{program.language === "AR" ? "AR" : "EN"}</p><p className="dlp-stat-label">لغة البرنامج</p></div>
        </section>

        <section className="brand-card dlp-program-section">
          <div className="dlp-section-head"><div><h2>المادة التدريبية</h2><p>ارفع المادة التي ستُبنى عليها الأيام والأسئلة.</p></div></div>
          {program.documents?.length ? (
            <div className="dlp-doc-list">
              {program.documents.map((doc) => (
                <div key={doc.id} className="dlp-doc-row">
                  <strong>{doc.fileName}</strong>
                  <span>{doc.pageCount != null ? `${doc.pageCount} صفحة` : "عدد الصفحات غير محدد"}</span>
                  <span>{EXTRACTION_LABEL[doc.extractionStatus] ?? doc.extractionStatus}</span>
                  <DeleteDocumentButton
                    documentId={doc.id}
                    fileName={doc.fileName}
                    status={doc.extractionStatus}
                  />
                </div>
              ))}
            </div>
          ) : <p>لا توجد مادة مرفوعة بعد.</p>}
          <div className="dlp-upload-wrap"><DocumentUpload programId={id} /></div>
        </section>

        <section className="brand-card dlp-program-section">
          <div className="dlp-section-head">
            <div><h2>الأيام التدريبية</h2><p>إدارة تقسيم البرنامج والأسئلة الخاصة بكل يوم.</p></div>
            <Link href={`/programs/${id}/days`} className="brand-button-primary dlp-new-button">+ إضافة يوم</Link>
          </div>
          {program.days.length === 0 ? <div className="dlp-empty">لا توجد أيام تدريبية حتى الآن.</div> : (
            <div className="dlp-days-list">
              {program.days.map((day) => (
                <Link key={day.id} href={`/programs/${id}/days/${day.id}`} className="dlp-day-row">
                  <span>اليوم {day.dayNumber}</span>
                  <strong>{day.title}</strong>
                  <em>{day._count.questions} سؤال · {STATUS_LABEL[day.status] ?? day.status}</em>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="brand-card dlp-program-section">
          <div className="dlp-section-head"><div><h2>الجلسات المباشرة</h2><p>افتح جلسة لمتابعة المشاركين والأسئلة والنتائج المباشرة.</p></div></div>
          {program.sessions.length === 0 ? <div className="dlp-empty">لا توجد جلسات لهذا البرنامج بعد.</div> : (
            <div className="dlp-session-list">
              {program.sessions.map((item) => (
                <Link key={item.id} href={`/programs/${id}/sessions/${item.id}`} className="dlp-doc-row">
                  <strong dir="ltr">{item.sessionCode}</strong>
                  <span>{STATUS_LABEL[item.status] ?? item.status}</span>
                  <span>فتح الجلسة ←</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <form action={async () => {
          "use server";
          const result = await deleteProgram(id);
          if (!result.ok) throw new Error(result.error);
          redirect("/dashboard");
        }}>
          <button type="submit" className="dlp-danger-button">حذف البرنامج</button>
        </form>
      </div>
    </main>
  );
}
