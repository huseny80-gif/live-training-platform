import { statusLabel } from "@/lib/labels";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getProgram, deleteProgram } from "@/app/actions/programs";
import Link from "next/link";
import DocumentUpload from "./DocumentUpload";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "tp-bg-yellow-100 tp-text-yellow-800",
  ACTIVE: "tp-bg-green-100 tp-text-green-800",
  ARCHIVED: "tp-bg-gray-100 tp-text-gray-600",
};

export default async function ProgramPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let program: any;
  try {
    program = await getProgram(id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === "NOT_FOUND" || msg === "FORBIDDEN") notFound();
    throw e;
  }
  if (!program) notFound();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalQuestions = program.days.reduce((s: number, d: any) => s + d._count.questions, 0);

  return (
    <main className="tp-min-h-screen tp-bg-gray-50">
      <header className="tp-bg-white tp-border-b tp-px-6 tp-py-4 tp-flex tp-items-center tp-justify-between">
        <div className="tp-flex tp-items-center tp-gap-3">
          <Link href="/dashboard" className="tp-text-sm tp-text-gray-500 tp-hover-text-gray-800">
            → لوحة المدرب
          </Link>
          <span className="tp-text-gray-300">/</span>
          <h1 className="tp-font-bold">{program.title}</h1>
          <span className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full ${STATUS_COLOR[program.status]}`}>
            {statusLabel(program.status)}
          </span>
        </div>
        <div className="tp-flex tp-gap-2">
          <Link
            href={`/programs/${id}/manage`}
            className="tp-px-3 tp-py-1-5 tp-text-sm tp-bg-blue-50 tp-text-blue-700 tp-border tp-border-blue-200 tp-rounded-lg tp-hover-bg-blue-100"
          >
            📋 إدارة المحتوى
          </Link>
          <Link
            href={`/programs/${id}/edit`}
            className="tp-px-3 tp-py-1-5 tp-text-sm tp-border tp-rounded-lg tp-hover-bg-gray-50"
          >
            تعديل
          </Link>
          <form
            action={async () => {
              "use server";
              const result = await deleteProgram(id);
              if (!result.ok) throw new Error(result.error);
              redirect("/dashboard");
            }}
          >
            <button
              type="submit"
              className="tp-px-3 tp-py-1-5 tp-text-sm tp-bg-red-50 tp-text-red-600 tp-border tp-border-red-200 tp-rounded-lg tp-hover-bg-red-100"
            >
              حذف
            </button>
          </form>
        </div>
      </header>

      <div className="tp-max-w-4xl tp-mx-auto tp-p-6 tp-space-y-6">
        {/* Stats */}
        <div className="tp-grid tp-grid-cols-1 tp-sm-grid-cols-3 tp-gap-4">
          <div className="tp-bg-white tp-rounded-xl tp-border tp-p-4">
            <p className="tp-text-sm tp-text-gray-500">الأيام التدريبية</p>
            <p className="tp-text-3xl tp-font-bold">{program._count.days}</p>
          </div>
          <div className="tp-bg-white tp-rounded-xl tp-border tp-p-4">
            <p className="tp-text-sm tp-text-gray-500">الأسئلة</p>
            <p className="tp-text-3xl tp-font-bold">{totalQuestions}</p>
          </div>
          <div className="tp-bg-white tp-rounded-xl tp-border tp-p-4">
            <p className="tp-text-sm tp-text-gray-500">الجلسات</p>
            <p className="tp-text-3xl tp-font-bold">{program._count.sessions}</p>
          </div>
        </div>

        {program.description && (
          <div className="tp-bg-white tp-rounded-xl tp-border tp-p-4 tp-text-sm tp-text-gray-600">
            {program.description}
          </div>
                )}

        {/* Uploaded Documents */}
        {program.documents && program.documents.length > 0 && (
          <div className="tp-bg-white tp-rounded-xl tp-border tp-p-4 tp-space-y-2">
            <h2 className="tp-text-base tp-font-semibold">المستندات التدريبية</h2>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {program.documents.map((doc: any) => (
              <div key={doc.id} className="tp-flex tp-items-center tp-justify-between tp-text-sm tp-border tp-rounded-lg tp-px-3 tp-py-2">
                <div>
                  <span className="tp-font-medium">{doc.fileName}</span>
                  {doc.pageCount != null && (
                    <span className="tp-ml-2 tp-text-gray-400 tp-text-xs">{doc.pageCount} صفحة</span>
                  )}
                </div>
                <span
                  className={`tp-text-xs tp-px-2 tp-py-0-5 tp-rounded-full ${
                    doc.extractionStatus === "COMPLETED"
                      ? "tp-bg-green-100 tp-text-green-700"
                      : doc.extractionStatus === "FAILED"
                      ? "tp-bg-red-100 tp-text-red-700"
                      : "tp-bg-yellow-100 tp-text-yellow-700"
                  }`}
                >
                  {statusLabel(doc.extractionStatus)}
                </span>
              </div>
            ))}
          </div>
        )}

        <DocumentUpload programId={id} />

        {/* Training Days */}
        <div className="tp-flex tp-items-center tp-justify-between">
          <h2 className="tp-text-lg tp-font-semibold">الأيام التدريبية</h2>
          <Link
            href={`/programs/${id}/days`}
            className="tp-px-4 tp-py-2 tp-text-sm tp-bg-blue-600 tp-text-white tp-rounded-lg tp-hover-bg-blue-700"
          >
            + إضافة يوم
          </Link>
        </div>

        {program.days.length === 0 ? (
          <div className="tp-text-center tp-py-12 tp-text-gray-400 tp-bg-white tp-rounded-xl tp-border">
            لا توجد أيام تدريبية بعد.
          </div>
        ) : (
          <div className="tp-space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {program.days.map((day: any) => (<Link key={day.id} href={`/programs/${id}/days/${day.id}`} className="tp-bg-white tp-rounded-xl tp-border tp-p-4 tp-flex tp-items-center tp-justify-between tp-hover-bg-gray-50"><div><span className="tp-text-xs tp-font-mono tp-text-gray-400 tp-mr-2">اليوم {day.dayNumber}</span><span className="tp-font-medium">{day.title}</span><span className={`tp-ml-2 tp-text-xs tp-px-1-5 tp-py-0-5 tp-rounded ${day.status === "APPROVED" ? "tp-bg-green-100 tp-text-green-700" : "tp-bg-yellow-100 tp-text-yellow-700"}`}>{statusLabel(day.status)}</span></div><span className="tp-text-sm tp-text-gray-500">{day._count.questions} سؤال</span></Link>))}
          </div>
                )}

        {/* Sessions */}
        {program.sessions.length > 0 && (
          <>
            <h2 id="sessions" className="tp-text-lg tp-font-semibold">الجلسات</h2>
            <div className="tp-space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {program.sessions.map((s: any) => (
                <Link key={s.id} href={`/programs/${id}/sessions/${s.id}`} className="brand-card dlp-program tp-flex tp-justify-between tp-text-sm">
                  <span className="tp-font-mono tp-font-bold">{s.sessionCode}</span>
                  <span className="tp-text-gray-500">{statusLabel(s.status)}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
