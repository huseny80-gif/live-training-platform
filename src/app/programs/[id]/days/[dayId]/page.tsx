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
        <div>
          <Link href={`/programs/${id}`}>← البرنامج</Link>
          <span>/</span>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="dlp-day-container">
        {query.sessionError ? (
          <div role="alert" className="brand-card dlp-session-error">
            <strong>تعذر إنشاء جلسة الاختبار.</strong>
            <p>
              {query.sessionError === "arabic-questions"
                ? `يوجد ${Number.isFinite(invalidCount) ? invalidCount : 0} سؤال غير مطابق للغة العربية في هذا اليوم. صحّح بنك الأسئلة أولًا ثم أعد إنشاء الجلسة.`
                : query.sessionError === "no-arabic-questions"
                ? "لا توجد أسئلة عربية صالحة لهذا اليوم. أعد توليد محتوى البرنامج بالعربية من الملف التدريبي الأصلي."
                : query.sessionError === "no-questions"
                ? "لا توجد أسئلة صالحة لهذا اليوم. أضف أو اعتمد الأسئلة أولًا."
                : query.sessionError === "program"
                ? "تعذر العثور على البرنامج أو لا تملك صلاحية إنشاء جلسة له."
                : "حدث خطأ أثناء إنشاء الجلسة. لم يتم إنشاء جلسة ناقصة؛ حاول مرة أخرى بعد مراجعة المحتوى."}
            </p>
            {(query.sessionError === "arabic-questions" || query.sessionError === "no-arabic-questions") ? (
              <Link href={`/programs/${id}/manage`} className="dlp-control-button primary dlp-session-error-action">
                إدارة المحتوى وإعادة التوليد بالعربية
              </Link>
            ) : null}
          </div>
        ) : null}

        <section className="brand-card dlp-day-hero">
          <span>اليوم {day.dayNumber}</span>
          <h1>{day.title}</h1>
          <div className="dlp-day-meta">
            <span>الحالة <strong>{DAY_STATUS[day.status] ?? day.status}</strong></span>
            <span>الأسئلة <strong>{day._count.questions}</strong></span>
          </div>
        </section>

        <div className="dlp-day-grid">
          <section className="brand-card dlp-day-section">
            <h2>الأهداف</h2>
            {day.objectives.length ? (
              <ol>
                {day.objectives.map((objective, index) => <li key={index}>{objective}</li>)}
              </ol>
            ) : <p>لم تُضف أهداف لهذا اليوم.</p>}
          </section>

          <section className="brand-card dlp-day-section">
            <h2>ملخص المحتوى</h2>
            <p className="dlp-prewrap">{day.contentSummary || "لا يوجد ملخص مضاف."}</p>
          </section>
        </div>

        <section className="brand-card dlp-day-section">
          <div className="dlp-live-panel-head">
            <h2>المواضيع</h2>
            <span>{day.topics.length}</span>
          </div>
          {day.topics.length ? (
            <div className="dlp-topic-list">
              {day.topics.map((topic) => (
                <div key={topic.id} className="dlp-topic-row">
                  <span>{topic.topicOrder}</span>
                  <strong>{topic.title}</strong>
                </div>
              ))}
            </div>
          ) : <p>لا توجد مواضيع بعد.</p>}
        </section>

        {day._count.questions > 0 ? (
          <section className="brand-card dlp-session-ready">
            <div>
              <span className="dlp-session-ready-kicker">جلسة مباشرة</span>
              <h2>جاهز لبدء جلسة الاختبار؟</h2>
              <p>{day._count.questions} سؤال متاح لليوم {day.dayNumber}.</p>
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
                  if (message === "NO_ARABIC_QUESTIONS_FOR_DAY") {
                    redirect(`/programs/${id}/days/${dayId}?sessionError=no-arabic-questions`);
                  }
                  if (message === "NO_QUESTIONS_FOR_DAY") {
                    redirect(`/programs/${id}/days/${dayId}?sessionError=no-questions`);
                  }
                  if (message === "PROGRAM_NOT_FOUND") {
                    redirect(`/programs/${id}/days/${dayId}?sessionError=program`);
                  }

                  redirect(`/programs/${id}/days/${dayId}?sessionError=unexpected`);
                }

                redirect(`/programs/${id}/sessions/${liveSession.id}`);
              }}
            >
              <button type="submit" className="dlp-control-button success dlp-session-create-button">
                إنشاء جلسة الاختبار
              </button>
            </form>
          </section>
        ) : (
          <div className="brand-card dlp-session-warning">
            أضف أسئلة لهذا اليوم قبل إنشاء جلسة مباشرة.
          </div>
        )}
      </div>
    </main>
  );
}
