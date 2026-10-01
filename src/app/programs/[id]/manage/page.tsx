import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getProgramContent } from "@/app/actions/content";
import ManageClient from "./ManageClient";

export const dynamic = "force-dynamic";

export default async function ManageProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  let program;
  try {
    program = await getProgramContent(id);
  } catch {
    notFound();
  }
  if (!program) notFound();

  return (
    <main dir="rtl" lang="ar" className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link href={`/programs/${id}`} className="text-sm text-gray-500 hover:text-gray-800">
              → البرنامج
            </Link>
            <span className="text-gray-300">/</span>
            <h1 className="font-bold text-gray-800">إدارة المحتوى</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link href={`/programs/${id}/final-questions`} className="dlp-session-button">
              الأسئلة النهائية
            </Link>
            <Link href="/about" className="dlp-session-button">
              من نحن
            </Link>
          </div>
        </div>

        {/* Program info row */}
        <div className="bg-white rounded-2xl border p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="font-bold text-gray-900">{program.title}</p>
            <p className="text-sm text-gray-500">
              {program.days.length} يوم ·{" "}
              {program.days.reduce((s, d) => s + d._count.questions, 0)} سؤال ·{" "}
              {program.sessions.length} جلسة
            </p>
          </div>
        </div>

        <ManageClient program={program as Parameters<typeof ManageClient>[0]["program"]} />
      </div>
    </main>
  );
}
