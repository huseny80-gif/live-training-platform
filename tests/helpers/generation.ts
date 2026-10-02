import type { ContentGenerationResult } from "../../src/lib/ai/types";

/** Deterministic provider output for isolated local tests, never imported by the app. */
export function generatedCourseFixture(): ContentGenerationResult {
  return {
    days: Array.from({ length: 10 }, (_, i) => ({ dayNumber: i + 1, title: `اليوم ${i + 1}`, objectives: ["فهم الإحداثيات"], contentSummary: "تحليل البيانات المكانية", topics: ["التحليل المكاني"], pageRangeStart: 1, pageRangeEnd: 1, sourcePages: [1] })),
    questions: Array.from({ length: 50 }, (_, i) => ({ dayNumber: Math.floor(i / 5) + 1, questionOrder: i % 5 + 1, questionText: `ما طريقة تحليل المعلومات الجغرافية في المثال ${i + 1}؟`, options: ["A", "B", "C", "D"].map((label, j) => ({ label: label as "A" | "B" | "C" | "D", text: `اختيار التحليل ${j + 1}` })), correctLabel: "A", explanation: "تعتمد المعلومات الجغرافية على تحديد الموقع بالإحداثيات.", sourcePageNumber: 1 })),
    modelUsed: "TEST_ONLY", promptVersion: "test", inputTokens: 0, outputTokens: 0, generatedAt: new Date(),
  };
}
