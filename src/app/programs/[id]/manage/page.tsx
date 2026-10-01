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
    <main dir="rtl" lang="ar" className="tp-min-h-screen tp-bg-gray-50 tp-p-4 tp-md-p-6">
      <div className="tp-max-w-4xl tp-mx-auto tp-space-y-5">
        {/* Header */}
        <div className="tp-flex tp-items-center tp-gap-3">
          <Link href={`/programs/${id}`} className="tp-text-sm tp-text-gray-500 tp-hover-text-gray-800">
            → البرنامج
          </Link>
          <span className="tp-text-gray-300">/</span>
          <h1 className="tp-font-bold tp-text-gray-800">إدارة المحتوى</h1>
        </div>

        {/* Program info row */}
        <div className="tp-bg-white tp-rounded-2xl tp-border tp-p-4 tp-flex tp-items-center tp-gap-4">
          <div className="tp-flex-1">
            <p className="tp-font-bold tp-text-gray-900">{program.title}</p>
            <p className="tp-text-sm tp-text-gray-500">
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
