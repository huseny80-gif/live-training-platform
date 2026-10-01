import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import CopyCodeButton from "@/components/CopyCodeButton";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

function buildDailyGoogleAppsScript(
  title: string,
  days: Array<{
    dayNumber: number;
    title: string;
    questions: Array<{
      questionText: string;
      correctOptionId: string | null;
      options: Array<{ id: string; optionText: string; displayOrder: number }>;
    }>;
  }>,
) {
  const payload = days.map((day) => ({
    dayNumber: day.dayNumber,
    title: day.title,
    questions: day.questions
      .filter((question) => question.correctOptionId && question.options.length >= 2)
      .map((question) => ({
        text: question.questionText,
        options: [...question.options]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((option) => option.optionText),
        correctAnswer:
          question.options.find((option) => option.id === question.correctOptionId)?.optionText ?? "",
      }))
      .filter((question) => question.correctAnswer),
  }));

  const safePayload = JSON.stringify(payload).replace(/</g, "\\u003c");

  return `function createTrainingQuestionBankQuiz() {
  const form = FormApp.create(${JSON.stringify(title + " — اختبار بنك الأسئلة")});
  form.setIsQuiz(true);
  form.setDescription("اختبار تم إنشاؤه من بنك أسئلة الحقيبة التدريبية.");

  const days = ${safePayload};

  days.forEach(function(day) {
    form.addSectionHeaderItem().setTitle("اليوم " + day.dayNumber + " — " + day.title);

    day.questions.forEach(function(q, index) {
      const item = form.addMultipleChoiceItem();
      item.setTitle("س" + (index + 1) + ". " + q.text);
      item.setChoices(q.options.map(function(option) {
        return item.createChoice(option, option === q.correctAnswer);
      }));
      item.setRequired(true);
      item.setPoints(1);
    });
  });

  Logger.log("Edit URL: " + form.getEditUrl());
  Logger.log("Published URL: " + form.getPublishedUrl());
}`;
}

export default async function GoogleFormsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const program = await prisma.trainingProgram.findFirst({
    where: { id, instructorId: session.user.id },
    select: {
      id: true,
      title: true,
      days: {
        orderBy: { dayNumber: "asc" },
        select: {
          dayNumber: true,
          title: true,
          questions: {
            orderBy: { questionOrder: "asc" },
            select: {
              questionText: true,
              correctOptionId: true,
              options: {
                orderBy: { displayOrder: "asc" },
                select: {
                  id: true,
                  optionText: true,
                  displayOrder: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!program) notFound();

  const validCount = program.days.reduce(
    (sum, day) =>
      sum +
      day.questions.filter(
        (question) =>
          question.correctOptionId &&
          question.options.some((option) => option.id === question.correctOptionId),
      ).length,
    0,
  );

  const code = validCount > 0 ? buildDailyGoogleAppsScript(program.title, program.days) : "";

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div>
          <Link href={`/programs/${id}`}>← البرنامج التدريبي</Link>
          <span>/</span>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="dlp-google-wrap">
        <section className="brand-card dlp-google-card">
          <p className="dlp-form-eyebrow">Google Forms Quiz</p>
          <h1>تحويل بنك الأسئلة إلى Google Form</h1>
          <p>
            ينشئ هذا الكود نموذج Google Forms كاختبار Quiz مع الإجابات الصحيحة والنقاط،
            ويقسم الأسئلة بحسب الأيام التدريبية.
          </p>

          <div className="dlp-google-stats">
            <span>الأيام <strong>{program.days.length}</strong></span>
            <span>الأسئلة الجاهزة <strong>{validCount}</strong></span>
          </div>

          {validCount === 0 ? (
            <div className="dlp-session-warning">
              لا توجد أسئلة محفوظة بإجابات صحيحة حتى الآن. ولّد أسئلة الأيام أولًا ثم عد إلى هذه الصفحة.
            </div>
          ) : (
            <>
              <div className="dlp-google-actions">
                <CopyCodeButton value={code} />
                <a
                  href="https://script.google.com/home/projects/create"
                  target="_blank"
                  rel="noreferrer"
                  className="dlp-control-button neutral"
                >
                  فتح Google Apps Script
                </a>
              </div>

              <ol className="dlp-google-steps">
                <li>انسخ الكود أدناه.</li>
                <li>افتح Google Apps Script وأنشئ مشروعًا جديدًا.</li>
                <li>الصق الكود وشغّل الدالة <code dir="ltr">createTrainingQuestionBankQuiz</code>.</li>
                <li>وافق على الصلاحيات مرة واحدة، ثم افتح رابط Published URL من السجل.</li>
              </ol>

              <textarea
                className="dlp-code"
                readOnly
                value={code}
                rows={28}
                aria-label="كود Google Apps Script لبنك الأسئلة"
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}
