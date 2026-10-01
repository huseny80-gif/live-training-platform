import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getDay } from "@/app/actions/days";
import { createLiveSession } from "@/app/actions/sessions";
import { brand } from "@/lib/brand";

const DAY_STATUS: Record<string, string> = {
  DRAFT: "مسودة",
  APPROVED: "معتمد",
  ARCHIVED: "مؤرشف",
};

export default async function DayDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; dayId: string }>;
  searchParams: Promise<{ sessionError?: string; count?: string }>;
}) {
  const authSession = await auth();
  if (!authSession?.user?.id) redirect("/login");

  const { id, dayId } = await params;
  const query = await searchParams;

  let day;
  try {
    day = await getDay(dayId);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") notFound();
    throw error;
  }

  if (day.programId !== id) notFound();

  const invalidCount = Number(query.count ?? "0");

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div className="flex items-center gap-3">
          <Link href={`/programs/${id}`}>← البرنامج</Link>
          <span className="opacity-60">/</span>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-5">
        {query.sessionError === "arabic-questions" ? (
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
            <strong>تعذر إنشاء جلسة عربية.</strong>
            <p className="mt-1 text-sm">
              يوجد {Number.isFinite(invalidCount) ? invalidCount : 0} سؤال غير مطابق للغة العربية في هذا اليوم.
              صحّح بنك الأسئلة أولًا ثم أعد إنشاء الجلسة.
            </p>
          </div>
        ) : null}

        <section className="brand-card p-6 md:p-8">
          <p className="text-sm font-bold text-teal-700">اليوم {day.dayNumber}</p>
          <h1 className="text-2xl font-black mt-1">{day.title}</h1>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
            <span>الحالة: {DAY_STATUS[day.status] ?? day.status}</span>
            <span>الأسئلة: {day._count.questions}</span>
          </div>
        </section>

        <section className="brand-card p-6">
          <h2 className="text-lg font-black">الأهداف</h2>
          {day.objectives.length ? (
            <ol className="mt-4 space-y-2 list-decimal list-inside">
              {day.objectives.map((objective, index) => <li key={index}>{objective}</li>)}
            </ol>
          ) : <p className="mt-3 text-slate-500">لم تُضف أهداف لهذا اليوم.</p>}
        </section>

        <section className="brand-card p-6">
          <h2 className="text-lg font-black">ملخص المحتوى</h2>
          <p className="mt-4 whitespace-pre-wrap text-slate-700">{day.contentSummary || "لا يوجد ملخص مضاف."}</p>
        </section>

        <section className="brand-card p-6">
          <h2 className="text-lg font-black">المواضيع</h2>
          {day.topics.length ? (
            <div className="mt-4 space-y-2">
              {day.topics.map((topic) => (
                <div key={topic.id} className="border rounded-xl p-3 bg-white">
                  {topic.topicOrder}. {topic.title}
                </div>
              ))}
            </div>
          ) : <p className="mt-3 text-slate-500">لا توجد مواضيع بعد.</p>}
        </section>

        {day._count.questions > 0 ? (
          <section className="brand-card p-6 border-t-4 border-t-amber-500 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="font-black text-slate-900">جاهز لبدء جلسة مباشرة؟</p>
              <p className="text-sm text-slate-600 mt-1">{day._count.questions} سؤال متاح لليوم {day.dayNumber}.</p>
            </div>
            <form
              action={async () => {
                "use server";
                let liveSession;
                try {
                  liveSession = await createLiveSession(id, day.dayNumber);
                } catch (error) {
                  const message = error instanceof Error ? error.message : "";
                  if (message.startsWith("NON_ARABIC_QUESTIONS_IN_ARABIC_PROGRAM:")) {
                    const count = message.split(":")[1] ?? "0";
                    redirect(`/programs/${id}/days/${dayId}?sessionError=arabic-questions&count=${encodeURIComponent(count)}`);
                  }
                  throw error;
                }
                redirect(`/programs/${id}/sessions/${liveSession.id}`);
              }}
            >
              <button type="submit" className="px-5 py-2.5 bg-teal-700 text-white rounded-xl font-bold hover:bg-teal-800">
                إنشاء جلسة الاختبار
              </button>
            </form>
          </section>
        ) : (
          <div className="rounded-2xl border bg-amber-50 p-5 text-amber-800">
            أضف أسئلة لهذا اليوم قبل إنشاء جلسة مباشرة.
          </div>
        )}
      </div>
    </main>
  );
}
