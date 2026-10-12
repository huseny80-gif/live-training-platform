import { prisma } from "@/lib/prisma";
import { defaultCategories, type Category, type ResourceItem } from "./types";
import { formatTimestamp } from "@/lib/exam-material/timestamps";
import type { VideoCue } from "@/lib/exam-material/video-transcript";
export async function resourceDirectory(programId: string | null, owner: string) {
  if (programId && !await prisma.trainingProgram.findFirst({ where: { id: programId, instructorId: owner } })) throw new Error("NOT_FOUND");
  const scope = { ...(programId ? { programId } : {}), program: { instructorId: owner } };
  const [categories, files, docs, videos, exams, sessions] = await Promise.all([
    prisma.resourceCategory.findMany({ where: scope, orderBy: { createdAt: "asc" } }),
    prisma.resourceFile.findMany({ where: { ...scope, status: "READY" }, orderBy: { createdAt: "desc" } }),
    prisma.trainingDocument.findMany({ where: { ...scope, archivedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.trainingVideo.findMany({ where: { ...scope, archivedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.examMaterialBatch.findMany({ where: { ...scope, deletedAt: null }, select: { id: true, programId: true, title: true, status: true, questionCount: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
    prisma.liveSession.findMany({ where: { ...scope, instructorId: owner }, select: { id: true, programId: true, dayNumber: true, title: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const kinds: Category[] = [...defaultCategories, ...categories.filter(c => !defaultCategories.some(d => d.key === c.key)).map(c => ({ key: c.key, name: c.name, icon: c.icon, programId: c.programId, custom: true }))];
  const items: ResourceItem[] = files.map(f => ({ id: f.id, programId: f.programId, categoryKey: f.categoryKey, title: f.title, kind: "file", date: f.createdAt.toISOString(), sizeBytes: f.sizeBytes, detail: f.fileName, archived: Boolean(f.archivedAt), previewUrl: `/resources/${f.id}`, downloadUrl: `/api/resources/${f.id}/file?download=1` }));
  items.push(...docs.map(d => ({ id: d.id, programId: d.programId, categoryKey: "slides", title: d.fileName, kind: "lecture" as const, date: d.createdAt.toISOString(), sizeBytes: d.fileSizeBytes, detail: `${d.pageCount ?? "—"} صفحة`, previewUrl: `/programs/${d.programId}/lectures?documentId=${d.id}`, downloadUrl: `/api/documents/${d.id}/file?download=1` })));
  items.push(...videos.map(v => ({ id: v.id, programId: v.programId, categoryKey: "videos", title: v.title, kind: "video" as const, date: v.createdAt.toISOString(), detail: `تفريغ نصي · ${formatTimestamp((v.transcript as unknown as VideoCue[]).at(-1)?.endSeconds)}`, previewUrl: `/resources/video/${v.id}`, downloadUrl: `/api/resources/exports/video/${v.id}` })));
  items.push(...exams.map(e => ({ id: e.id, programId: e.programId, categoryKey: "exams", title: e.title ?? "مادة امتحانية", kind: "exam" as const, date: e.createdAt.toISOString(), detail: `${e.questionCount} سؤالًا · ${e.status === "READY" ? "للمراجعة" : e.status === "GENERATING" ? "قيد التوليد" : "تعذّر التوليد"}`, previewUrl: `/exam-material?programId=${e.programId}&batchId=${e.id}`, ...(e.status === "READY" ? { downloadUrl: `/api/resources/exports/exam/${e.id}` } : {}) })));
  items.push(...sessions.map(s => ({ id: `result-${s.id}`, programId: s.programId, categoryKey: "results", title: s.title ?? (s.dayNumber === 0 ? "نتائج الاختبار النهائي" : `نتائج اليوم ${s.dayNumber}`), kind: "result" as const, date: s.createdAt.toISOString(), detail: s.dayNumber === 0 ? "اختبار نهائي · Excel" : `اليوم ${s.dayNumber} · Excel`, previewUrl: `/programs/${s.programId}/sessions/${s.id}/results`, downloadUrl: `/api/session/${s.id}/export` })));
  items.push(...sessions.filter(s => s.dayNumber === 0).map(s => ({ id: `final-${s.id}`, programId: s.programId, categoryKey: "exams", title: s.title ?? "اختبار نهائي مستقل", kind: "exam" as const, date: s.createdAt.toISOString(), detail: "جلسة اختبار نهائي", previewUrl: `/programs/${s.programId}/sessions/${s.id}`, downloadUrl: `/api/resources/exports/final/${s.id}` })));
  return { categories: kinds, items };
}
