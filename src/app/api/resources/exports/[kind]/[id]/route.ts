import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { captionTimestamp } from "@/lib/exam-material/timestamps";
import type { VideoCue } from "@/lib/exam-material/video-transcript";
import { validateMaterialSources } from "@/lib/exam-material/source-quality";
import type { Material, SourcePage } from "@/lib/exam-material/grounding";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const user = await auth(); if (!user?.user?.id) return new Response(null, { status: 401 });
  const { kind, id } = await params; const owner = user.user.id;
  let body: string, name: string, type: string;
  if (kind === "video") {
    const video = await prisma.trainingVideo.findFirst({ where: { id, archivedAt: null, program: { instructorId: owner } } });
    if (!video) return new Response(null, { status: 404 });
    body = (video.transcript as unknown as VideoCue[]).map((c, i) => `${i + 1}\n${captionTimestamp(c.startSeconds)} --> ${captionTimestamp(c.endSeconds)}\n${c.text}`).join("\n\n"); name = `${video.title}.srt`; type = "application/x-subrip; charset=utf-8";
  } else if (kind === "exam") {
    const batch = await prisma.examMaterialBatch.findFirst({ where: { id, status: "READY", deletedAt: null, program: { instructorId: owner } } });
    if (!batch?.content) return new Response(null, { status: 404 });
    try { validateMaterialSources(batch.content as unknown as Material, batch.sources as unknown as SourcePage[]); } catch { return new Response("المادة تحتاج إلى إعادة مراجعة المصدر.", { status: 409 }); }
    // Private instructor export includes answers, but never sharing/attempt tokens or student data.
    body = JSON.stringify({ title: batch.title, content: batch.content, instructorGuide: batch.instructorGuide }, null, 2); name = "exam-material.json"; type = "application/json; charset=utf-8";
  } else if (kind === "final") {
    const exam = await prisma.liveSession.findFirst({ where: { id, dayNumber: 0, instructorId: owner, program: { instructorId: owner } }, select: { title: true, sessionQuestions: { orderBy: { questionOrder: "asc" }, select: { question: { select: { questionText: true, correctOptionId: true, options: { select: { id: true, optionText: true, displayOrder: true }, orderBy: { displayOrder: "asc" } } } } } } } });
    if (!exam) return new Response(null, { status: 404 });
    body = JSON.stringify(exam, null, 2); name = "final-exam.json"; type = "application/json; charset=utf-8";
  } else return new Response(null, { status: 404 });
  return new Response(body, { headers: { "Content-Type": type, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
