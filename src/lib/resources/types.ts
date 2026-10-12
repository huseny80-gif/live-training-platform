export const defaultCategories = [
  { key: "exams", name: "المادة الامتحانية", icon: "📝" },
  { key: "videos", name: "مكتبة الفيديوهات التدريبية", icon: "🎥" },
  { key: "slides", name: "الشرائح والعروض التقديمية", icon: "📊" },
  { key: "docs", name: "الملفات النصية وورد", icon: "📄" },
  { key: "results", name: "نتائج الاختبارات اليومية والنهائية", icon: "📈" },
  { key: "assignments", name: "الواجبات والمهام العملية", icon: "📋" },
] as const;
export type Category = { key: string; name: string; icon: string; custom?: boolean; programId?: string };
export type ResourceItem = { id: string; programId?: string; categoryKey: string; title: string; kind: "file" | "exam" | "video" | "lecture" | "result"; date: string; sizeBytes?: number; detail?: string; previewUrl: string; downloadUrl?: string; archived?: boolean };
export const resourceMimeTypes: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", txt: "text/plain", mp4: "video/mp4", webm: "video/webm" };
export const maxResourceSize = 512 * 1024 * 1024;
export function formatSize(bytes?: number) {
  if (bytes === undefined) return "";
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}
