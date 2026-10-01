import { statusLabel } from "@/lib/labels";
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
    <main className="tp-min-h-screen tp-bg-gray-50 tp-p-6">
      <div className="tp-max-w-4xl tp-mx-auto tp-space-y-6">
        <Link href={`/programs/${id}`} className="tp-text-sm tp-text-gray-600">
          → العودة للبرنامج
        </Link>

        <section className="tp-bg-white tp-rounded-2xl tp-border tp-p-8">
          <p className="tp-text-sm tp-text-gray-500">اليوم {day.dayNumber}</p>
          <h1 className="tp-text-2xl tp-font-bold tp-mt-1">{day.title}</h1>
          <p className="tp-mt-4 tp-text-sm">الحالة: {statusLabel(day.status)}</p>
          <p className="tp-mt-2 tp-text-sm">عدد الأسئلة: {day._count.questions}</p>
        </section>

        <section className="tp-bg-white tp-rounded-2xl tp-border tp-p-8">
          <h2 className="tp-text-lg tp-font-semibold">الأهداف</h2>
          <ul className="tp-mt-4 tp-space-y-2">
            {day.objectives.map((objective, index) => (
              <li key={index}>
                {index + 1}. {objective}
              </li>
            ))}
          </ul>
        </section>

        <section className="tp-bg-white tp-rounded-2xl tp-border tp-p-8">
          <h2 className="tp-text-lg tp-font-semibold">ملخص المحتوى</h2>
          <p className="tp-mt-4 tp-whitespace-pre-wrap">
            {day.contentSummary || "لم يُضف ملخص للمحتوى بعد."}
          </p>
        </section>

        <section className="tp-bg-white tp-rounded-2xl tp-border tp-p-8">
          <h2 className="tp-text-lg tp-font-semibold">الموضوعات</h2>

          {day.topics.length > 0 ? (
            <div className="tp-mt-4 tp-space-y-2">
              {day.topics.map((topic) => (
                <div key={topic.id} className="tp-border tp-rounded-lg tp-p-3">
                  {topic.topicOrder}. {topic.title}
                </div>
              ))}
            </div>
          ) : (
            <p className="tp-mt-4 tp-text-gray-500">
              لم تُنشأ موضوعات بعد.
            </p>
          )}
        </section>

        {day._count.questions > 0 && (
          <section className="tp-bg-blue-50 tp-rounded-2xl tp-border tp-border-blue-200 tp-p-6 tp-flex tp-items-center tp-justify-between">
            <div>
              <p className="tp-font-semibold tp-text-blue-900">هل أنت مستعد لبدء الاختبار المباشر؟</p>
              <p className="tp-text-sm tp-text-blue-700 tp-mt-1">{day._count.questions} questions available for اليوم {day.dayNumber}</p>
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
                className="tp-px-5 tp-py-2-5 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-font-medium tp-hover-bg-blue-700 tp-text-sm"
              >
                إنشاء جلسة اختبار
              </button>
            </form>
          </section>
        )}

        <Link
          href={`/programs/${id}`}
          className="tp-inline-block tp-px-4 tp-py-2 tp-border tp-rounded-lg tp-bg-white"
        >
          → العودة للبرنامج
        </Link>
      </div>
    </main>
  );
}
