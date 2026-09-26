import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getProgram, deleteProgram } from "@/app/actions/programs";
import Link from "next/link";
import DocumentUpload from "./DocumentUpload";

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  ACTIVE: "bg-green-100 text-green-800",
  ARCHIVED: "bg-gray-100 text-gray-600",
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
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">
            ← Dashboard
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="font-bold">{program.title}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[program.status]}`}>
            {program.status}
          </span>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/programs/${id}/edit`}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
          >
            Edit
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
              className="px-3 py-1.5 text-sm bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100"
            >
              Delete
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Days</p>
            <p className="text-3xl font-bold">{program._count.days}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Questions</p>
            <p className="text-3xl font-bold">{totalQuestions}</p>
          </div>
          <div className="bg-white rounded-xl border p-4">
            <p className="text-sm text-gray-500">Sessions</p>
            <p className="text-3xl font-bold">{program._count.sessions}</p>
          </div>
        </div>

        {program.description && (
          <div className="bg-white rounded-xl border p-4 text-sm text-gray-600">
            {program.description}
          </div>
                )}

        {/* Uploaded Documents */}
        {program.documents && program.documents.length > 0 && (
          <div className="bg-white rounded-xl border p-4 space-y-2">
            <h2 className="text-base font-semibold">Training Documents</h2>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {program.documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                <div>
                  <span className="font-medium">{doc.fileName}</span>
                  {doc.pageCount != null && (
                    <span className="ml-2 text-gray-400 text-xs">{doc.pageCount} pages</span>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    doc.extractionStatus === "COMPLETED"
                      ? "bg-green-100 text-green-700"
                      : doc.extractionStatus === "FAILED"
                      ? "bg-red-100 text-red-700"
                      : "bg-yellow-100 text-yellow-700"
                  }`}
                >
                  {doc.extractionStatus}
                </span>
              </div>
            ))}
          </div>
        )}

        <DocumentUpload programId={id} />

        {/* Training Days */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Training Days</h2>
          <Link
            href={`/programs/${id}/days`}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Add Day
          </Link>
        </div>

        {program.days.length === 0 ? (
          <div className="text-center py-12 text-gray-400 bg-white rounded-xl border">
            No days yet.
          </div>
        ) : (
          <div className="space-y-2">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {program.days.map((day: any) => (<Link key={day.id} href={`/programs/${id}/days/${day.id}`} className="bg-white rounded-xl border p-4 flex items-center justify-between hover:bg-gray-50"><div><span className="text-xs font-mono text-gray-400 mr-2">Day {day.dayNumber}</span><span className="font-medium">{day.title}</span><span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${day.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{day.status}</span></div><span className="text-sm text-gray-500">{day._count.questions} Q</span></Link>))}
          </div>
                )}

        {/* Sessions */}
        {program.sessions.length > 0 && (
          <>
            <h2 className="text-lg font-semibold">Sessions</h2>
            <div className="space-y-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {program.sessions.map((s: any) => (
                <div key={s.id} className="bg-white rounded-xl border p-4 flex justify-between text-sm">
                  <span className="font-mono font-bold">{s.sessionCode}</span>
                  <span className="text-gray-500">{s.status}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
