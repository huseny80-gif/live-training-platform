import "server-only";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
export async function questionDirectory(programId?: string, scope: "daily" | "final" = "daily") {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const programs = await prisma.trainingProgram.findMany({ where: { instructorId: session.user.id }, select: { id: true, title: true }, orderBy: { createdAt: "desc" } });
  if (programId && !programs.some(p => p.id === programId)) notFound();
  const selected = programId ?? programs[0]?.id;
  const program = selected ? await prisma.trainingProgram.findFirst({
    where: { id: selected, instructorId: session.user.id },
    select: { id: true, title: true, days: { where: { dayNumber: scope === "final" ? 0 : { gt: 0 } }, orderBy: { dayNumber: "asc" }, select: { dayNumber: true, title: true, questions: {
      where: { status: { not: "REJECTED" } }, orderBy: { questionOrder: "asc" },
      select: { id: true, questionType: true, questionText: true, status: true, topic: true, explanation: true, correctOptionId: true, sourcePageStart: true,
        options: { orderBy: { displayOrder: "asc" }, select: { id: true, optionLabel: true, optionText: true } } },
    } } } },
  }) : null;
  return { programs, program, instructorId: session.user.id };
}
