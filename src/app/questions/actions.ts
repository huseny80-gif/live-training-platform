"use server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
export async function approveQuestion(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const question = await prisma.question.findFirst({ where: { id: String(form.get("questionId") ?? ""), day: { program: { instructorId: session.user.id } } }, select: { id: true, programId: true, questionText: true, correctOptionId: true, options: { select: { id: true, optionText: true } } } });
  if (!question || !question.questionText.trim() || question.options.length < 2 || question.options.some(o => !o.optionText.trim()) || !question.options.some(o => o.id === question.correctOptionId)) throw new Error("QUESTION_NOT_READY");
  await prisma.question.updateMany({ where: { id: question.id, status: "DRAFT", day: { program: { instructorId: session.user.id } } }, data: { status: "APPROVED" } });
  revalidatePath("/questions"); revalidatePath("/google-forms"); revalidatePath(`/programs/${question.programId}/manage`);
}
