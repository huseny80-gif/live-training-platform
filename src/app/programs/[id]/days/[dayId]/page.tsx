import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDay } from "@/app/actions/days";
import { createLiveSession } from "@/app/actions/sessions";

export default async function DayDetailsPage({
  params,
}: {
  params: Promise<{ id: string; dayId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id, dayId } = await params;

  let day;
  try {
    day = await getDay(dayId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }

  if (day.programId !== id) notFound();

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <div className="dlp-program-container">
        <Link href={`/programs/${id}`} className="text-sm text-gray-600">
          → العودة إلى البرنامج
        </Link>

        <section className="bg-white rounded-2xl border p-8">
          <p className="text-sm text-gray-500">اليوم {day.dayNumber}</p>
          <h1 className="text-2xl font-bold mt-1">{day.title}</h1>
          <p className="mt-4 text-sm">الحالة: {day.status}</p>
          <p className="mt-2 text-sm">الأسئلة: {day._count.questions}</p>
        </section>

        <section className="bg-white rounded-2xl border p-8">
          <h2 className="text-lg font-semibold">الأهداف التدريبية</h2>
          <ul className="mt-4 space-y-2">
            {day.objectives.map((objective, index) => (
              <li key={index}>
                {index + 1}. {objective}
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-white rounded-2xl border p-8">
          <h2 className="text-lg font-semibold">ملخص المحتوى</h2>
          <p className="mt-4 whitespace-pre-wrap">
            {day.contentSummary || "لا يوجد ملخص محتوى بعد."}
          </p>
        </section>

        <section className="bg-white rounded-2xl border p-8">
          <h2 className="text-lg font-semibold">الموضوعات</h2>

          {day.topics.length > 0 ? (
            <div className="mt-4 space-y-2">
              {day.topics.map((topic) => (
                <div key={topic.id} className="border rounded-lg p-3">
                  {topic.topicOrder}. {topic.title}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-gray-500">
              لم يتم إنشاء موضوعات بعد.
            </p>
          )}
        </section>

        {day._count.questions > 0 && (
          <section className="bg-blue-50 rounded-2xl border border-blue-200 p-6 flex items-center justify-between">
            <div>
              <p className="font-semibold text-blue-900">جاهز لبدء جلسة تفاعلية؟</p>
              <p className="text-sm text-blue-700 mt-1">{day._count.questions} questions available for اليوم {day.dayNumber}</p>
            </div>
            <form
              action={async () => {
                "use server";
                const session = await createLiveSession(id, day.dayNumber);
                redirect(`/programs/${id}/sessions/${session.id}`);
              }}
            >
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 text-sm"
              >
                إنشاء وفتح جلسة المتدربين
              </button>
            </form>
          </section>
        )}

        <Link
          href={`/programs/${id}`}
          className="inline-block px-4 py-2 border rounded-lg bg-white"
        >
          → العودة إلى البرنامج
        </Link>
      </div>
    </main>
  );
}
