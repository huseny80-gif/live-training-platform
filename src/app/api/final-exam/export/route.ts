import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildFinalExamWord } from "@/lib/word/final-exam";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const selection = { questionText: true, questionType: true, status: true, explanation: true, correctOptionId: true, options: { orderBy: { displayOrder: "asc" as const }, select: { id: true, optionText: true } } } as const;
export async function GET(request: Request) {
  const user = await auth();
  if (!user?.user?.id) return new Response(null, { status: 401 });
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const input = z.object({ programId: z.string().uuid(), examId: z.string().uuid().optional() }).safeParse(query);
  if (!input.success) return new Response("اختيار البرنامج أو الاختبار غير صالح.", { status: 400 });
  const { programId, examId } = input.data;
  const program = await prisma.trainingProgram.findFirst({ where: { id: programId, instructorId: user.user.id }, select: { title: true } });
  if (!program) return new Response(null, { status: 404 });
  let title = `${program.title} — الأسئلة النهائية`;
  let questions;
  if (examId) {
    const exam = await prisma.liveSession.findFirst({ where: { id: examId, programId, dayNumber: 0, instructorId: user.user.id }, select: { title: true, sessionQuestions: { orderBy: { questionOrder: "asc" }, select: { question: { select: selection } } } } });
    if (!exam) return new Response(null, { status: 404 });
    title = exam.title ?? title; questions = exam.sessionQuestions.map(s => s.question);
  } else {
    questions = await prisma.question.findMany({ where: { programId, day: { programId, dayNumber: 0 }, status: { not: "REJECTED" } }, orderBy: [{ questionOrder: "asc" }, { id: "asc" }], select: selection });
  }
  try {
    const bytes = buildFinalExamWord(title, questions);
    return new Response(Buffer.from(bytes), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename="final-exam-with-answers.docx"; filename*=UTF-8''${encodeURIComponent(title + '.docx')}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    const empty = error instanceof Error && error.message === "NO_QUESTIONS";
    return new Response(empty ? "لا توجد أسئلة نهائية للتصدير بعد." : "راجع الأسئلة وحدد إجابة صحيحة لكل سؤال قبل التصدير.", { status: 409 });
  }
}
