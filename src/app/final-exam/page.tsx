import FinalGenerators from "./FinalGenerators";
import { finalJobStatus } from "@/lib/ai/final-jobs";
import Link from "next/link";
import { questionDirectory } from "@/lib/question-directory";
import { prisma } from "@/lib/prisma";
import ProgramPicker from "@/components/platform/ProgramPicker";
import { createFinalExam } from "./actions";
export default async function FinalExamPage({ searchParams }: { searchParams: Promise<{ programId?: string; error?: string }> }) {
  const query = await searchParams;
  const { programs, program, instructorId } = await questionDirectory(query.programId, "final");
  const directory = await prisma.trainingProgram.findMany({ where: { instructorId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, documents: { where: { extractionStatus: "COMPLETED" }, orderBy: { createdAt: "desc" }, select: { id: true, fileName: true } } } });
  const generationPrograms = await Promise.all(directory.map(async p => { const status = await finalJobStatus(p.id, instructorId); return { ...p, questions: status?.questions ?? 0, state: status?.state ?? { status: "idle" as const } }; }));
  const available = program?.days.flatMap(d => d.questions).filter(q => (q.status === "APPROVED" || q.status === "USED") && q.options.length >= 2 && q.options.some(o => o.id === q.correctOptionId)).length ?? 0;
  const exams = program ? await prisma.liveSession.findMany({ where: { programId: program.id, dayNumber: 0 }, select: { id: true, title: true, _count: { select: { sessionQuestions: true } } }, orderBy: { createdAt: "desc" } }) : [];
  return <main className="platform-content"><h1>الأسئلة النهائية</h1><h2>اختبار نهائي مستقل</h2>
    <p>ولّد أسئلة نهائية مستقلة، ثم راجعها واعتمدها لإنشاء جلسة تقييم برمز انضمام ونتائج خاصة بها.</p>
    <FinalGenerators programs={generationPrograms}/>
    {programs.length > 0 && <ProgramPicker programs={programs} selected={program?.id}/>}
    {program && <section className="brand-card tp-p-4 tp-space-y-3"><h2>{program.title}</h2><p>الأسئلة المعتمدة المتاحة: {available}</p>
      <Link href={`/questions?programId=${program.id}&scope=final`} className="brand-btn brand-btn-secondary">مراجعة الأسئلة واعتمادها</Link>
      <form action={createFinalExam} className="tp-space-y-3"><input type="hidden" name="programId" value={program.id}/>
        <label htmlFor="final-count">عدد أسئلة الاختبار النهائي</label><input id="final-count" className="platform-input" name="count" type="number" value={35} readOnly/>
        <button className="brand-btn brand-btn-primary" disabled={available !== 35}>إنشاء اختبار نهائي</button>
      </form>{query.error && <p role="alert">تعذّر إنشاء الاختبار. تحقق من عدد الأسئلة المعتمدة وصلاحية إجاباتها.</p>}
    </section>}
    {!program && <p>أنشئ برنامجاً وأضف أسئلته أولاً.</p>}
    {exams.length > 0 && <section className="tp-space-y-3"><h2>الاختبارات النهائية المحفوظة</h2>{exams.map(exam => <div className="platform-question" key={exam.id}><Link href={`/programs/${program!.id}/sessions/${exam.id}`}>{exam.title} · {exam._count.sessionQuestions} سؤال</Link><Link href={`/google-forms?programId=${program!.id}&examId=${exam.id}`}>تجهيز الاختبار في Google Forms</Link></div>)}</section>}
  </main>;
}
