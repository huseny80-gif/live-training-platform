import { sourceSpans, type SourcePage, type SelectionPlan } from "../../src/lib/exam-material/grounding";
export const pages: SourcePage[] = [{ id: "page-one", documentId: "lecture-one", fileName: "المحاضرة الأولى.pdf", pageNumber: 3, text: [
  "تصف المحاضرة نظام المعلومات الجغرافية بأنه أداة لربط البيانات بالموقع.",
  "تقدم المحاضرة التحليل المكاني باعتباره موضوعاً لدراسة المواقع والعلاقات بينها.",
  "يعرض النص قاعدة البيانات باعتبارها وسيلة لتنظيم المعلومات ضمن سجلات محددة.",
  "تناقش المادة الإسقاط الخرائطي وعلاقته بتمثيل المواقع ضمن الخريطة المستخدمة.",
  "تقدم المحاضرة الاستشعار عن بعد بوصفه موضوعاً لجمع المعلومات عن سطح الأرض.",
].join("\n") }];
const spans = sourceSpans(pages);
export const answers = ["نظام المعلومات الجغرافية", "التحليل المكاني", "قاعدة البيانات", "الإسقاط الخرائطي", "الاستشعار عن بعد"];
export const plan: SelectionPlan = {
  summary: spans.slice(0, 3).map(s => s.id),
  concepts: [{ spanId: spans[0].id, label: "نظام المعلومات الجغرافية" }, { spanId: spans[0].id, label: "البيانات" }, { spanId: spans[0].id, label: "الموقع" }],
  links: [{ from: 0, to: 1, spanId: spans[0].id }],
  questions: spans.map((s, i) => ({ spanId: s.id, answer: answers[i], distractors: [1, 2, 3].map(shift => ({ spanId: spans[(i + shift) % 5].id, text: answers[(i + shift) % 5] })) })),
  debrief: [{ spanId: spans[0].id, focus: "البيانات", kind: "EXPLAIN" }, { spanId: spans[1].id, focus: "التحليل المكاني", kind: "APPLY" }],
};
