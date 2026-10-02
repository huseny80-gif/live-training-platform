import QuestionEditor from "@/components/platform/QuestionEditor";
import { approveQuestion } from "./actions";
import Link from "next/link";
import { questionDirectory } from "@/lib/question-directory";
import ProgramPicker from "@/components/platform/ProgramPicker";
const statuses: Record<string, string> = { DRAFT: "مسودة للمراجعة", APPROVED: "معتمد", USED: "مستخدم" };
export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ programId?: string; scope?: string }> }) {
  const { programId, scope } = await searchParams;
  const final = scope === "final";
  const { programs, program } = await questionDirectory(programId, final ? "final" : "daily");
  const total = program?.days.reduce((sum, d) => sum + d.questions.length, 0) ?? 0;
  return <main className="platform-content"><h1>{final ? "مراجعة الأسئلة النهائية" : "مراجعة الأسئلة"}</h1>
    <p>راجع الأسئلة المحفوظة وإجاباتها قبل استخدامها. تظهر حالة اعتماد كل سؤال، وتُستبعد الأسئلة المرفوضة.</p>
    {programs.length > 0 && <ProgramPicker programs={programs} selected={program?.id} scope={final ? "final" : undefined}/>}
    {program && <div className="tp-flex tp-gap-3 tp-items-center tp-flex-wrap"><strong>{program.title} · {total} سؤال</strong>
      <Link className="brand-btn brand-btn-secondary" href={`/programs/${program.id}/manage`}>إدارة المحتوى</Link>
      <Link className="brand-btn brand-btn-primary" href={`/google-forms?programId=${program.id}${final ? "&scope=final" : ""}`}>مولد Google Forms</Link>
    </div>}
    {!total && <p className="brand-card tp-p-4">لا توجد أسئلة محفوظة هنا بعد. افتح البرنامج لتوليد الأسئلة أو إضافتها.</p>}
    {program?.days.filter(d => d.questions.length > 0).map(day => <section key={day.dayNumber} className="tp-space-y-3">
      <h2>{final ? "أسئلة الاختبار النهائي" : `اليوم ${day.dayNumber}: ${day.title}`}</h2>
      {day.questions.map((q, i) => <article className="platform-question" key={q.id}>
        <h3>{i + 1}. {q.questionText}</h3><p>{q.questionType === "TRUE_FALSE" ? "صح/خطأ" : "اختيار من متعدد"}</p><p>{statuses[q.status] ?? q.status}{q.sourcePageStart ? ` · صفحة المصدر ${q.sourcePageStart}` : ""}</p>
        <ol>{q.options.map(o => <li key={o.id}>{o.optionText}{o.id === q.correctOptionId && <strong> — الإجابة الصحيحة ✓</strong>}</li>)}</ol>
        <QuestionEditor question={q}/>
        {q.status === "DRAFT" && <form action={approveQuestion}><input type="hidden" name="questionId" value={q.id}/><button className="brand-btn brand-btn-primary" type="submit">اعتماد السؤال</button></form>}
        {q.explanation && <p>التفسير: {q.explanation}</p>}
      </article>)}
    </section>)}
  </main>;
}
