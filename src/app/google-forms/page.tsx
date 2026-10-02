import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { questionDirectory } from "@/lib/question-directory";
import ProgramPicker from "@/components/platform/ProgramPicker";
import FormGenerator from "./FormGenerator";
export default async function GoogleFormsPage({ searchParams }: { searchParams: Promise<{ programId?: string; examId?: string; scope?: string }> }) {
  const query = await searchParams;
  const { programs, program } = await questionDirectory(query.programId, query.scope === "final" ? "final" : "daily");
  const exam = query.examId && program ? await prisma.liveSession.findFirst({ where: { id: query.examId, programId: program.id, dayNumber: 0 }, select: { title: true, sessionQuestions: { orderBy: { questionOrder: "asc" }, select: { question: { select: { questionText: true, questionType: true, explanation: true, status: true, correctOptionId: true, options: { orderBy: { displayOrder: "asc" }, select: { id: true, optionText: true } } } } } } } }) : null;
  if (query.examId && !exam) notFound();
  const bank = (exam?.sessionQuestions.map(s => s.question) ?? program?.days.flatMap(d => d.questions) ?? []).filter(q => (q.status === "APPROVED" || q.status === "USED") && q.options.length >= 2 && q.options.some(o => o.id === q.correctOptionId));
  const finalReady = bank.length === 35 && bank.filter(q => q.questionType === "MULTIPLE_CHOICE").length === 15 && bank.filter(q => q.questionType === "TRUE_FALSE").length === 20;
  const questions = bank.map(q => ({
    text: q.questionText, explanation: q.explanation ?? "", options: q.options.map(o => ({ text: o.optionText, correct: o.id === q.correctOptionId })),
  }));
  return <main className="platform-content"><h1>{query.scope === "final" ? "مولد Google Forms للأسئلة النهائية" : "مولد Google Forms"}</h1>
    <p>جهّز اختباراً من الأسئلة المعتمدة، مع الخيارات والإجابات الصحيحة والتفسيرات. يُنشأ النموذج عند تشغيل الملف في حساب Google الخاص بك.</p>
    {programs.length > 0 && <ProgramPicker programs={programs} selected={program?.id} scope={query.scope === "final" ? "final" : undefined}/>}
    {program ? <><Link className="brand-btn brand-btn-secondary" href={`/questions?programId=${program.id}${query.scope === "final" ? "&scope=final" : ""}`}>مراجعة الأسئلة واعتمادها</Link><FormGenerator key={`${query.examId ?? program.id}:${query.scope ?? "daily"}`} title={exam?.title ?? (query.scope === "final" ? `${program.title} — الاختبار النهائي` : program.title)} questions={questions} blockedReason={query.scope === "final" && !finalReady ? "اعتمد الأسئلة النهائية الـ35 أولاً: 15 اختياراً من متعدد و20 صح/خطأ." : undefined}/></> : <p>أنشئ برنامجاً وأضف أسئلته أولاً.</p>}
  </main>;
}
