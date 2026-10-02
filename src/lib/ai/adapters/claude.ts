// ClaudeAIAdapter — primary AI adapter using Anthropic Claude API.
// API key is read from ANTHROPIC_API_KEY env at call time — never logged,
// never sent to any endpoint other than api.anthropic.com.

import Anthropic from "@anthropic-ai/sdk";
import type { AIAdapter, ContentGenerationRequest, ContentGenerationResult, GeneratedDayPlan, GeneratedQuestion } from "../types";
import { buildDayPlanPrompt, buildQuestionsPrompt, PROMPT_VERSION } from "../prompts";

const MODEL_ID = "claude-haiku-4-5-20251001";

const stringField = { type: "string" };
const integerField = { type: "integer" };
const strings = { type: "array", items: stringField };
function objectSchema(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}
const dayPlanSchema = objectSchema({ days: { type: "array", items: objectSchema({
  dayNumber: integerField, title: stringField, objectives: strings, contentSummary: stringField,
  topics: strings, pageRangeStart: integerField, pageRangeEnd: integerField,
  sourcePages: { type: "array", items: integerField },
}) } });
function questionOutputSchema(labels: string[]) {
  return objectSchema({ questions: { type: "array", items: objectSchema({
    questionText: stringField,
    options: { type: "array", items: objectSchema({ label: { type: "string", enum: labels }, text: stringField }) },
    correctLabel: { type: "string", enum: labels }, explanation: stringField,
    questionOrder: integerField, sourcePageNumber: integerField, topic: stringField,
    difficulty: { type: "string", enum: ["EASY", "MEDIUM", "HARD"] },
  }) } });
}
const questionSchema = questionOutputSchema(["A", "B", "C", "D"]);
const trueFalseSchema = questionOutputSchema(["A", "B"]);

export class ClaudeAIAdapter implements AIAdapter {
  readonly name = "CLAUDE";
  readonly modelId = MODEL_ID;

  async generate(req: ContentGenerationRequest): Promise<ContentGenerationResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var not set");

    const client = new Anthropic({ apiKey, timeout: 45_000, maxRetries: 0 });
    const deadline = AbortSignal.timeout(210_000);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // ── Step 1: Generate 10-day plan ─────────────────────────────────────────

    const purpose = req.assessmentType === "FINAL" ? "\nهذا اختبار نهائي مستقل وشامل للدورة؛ اعتبر الأيام محاور تقييم تغطي مختلف أجزاء المستند، وأنشئ أسئلة جديدة تتطلب تطبيق المعرفة والتحليل.\n" : "";
    const dayPlanPrompt = purpose + buildDayPlanPrompt(
      req.pages,
      req.programTitle,
      req.language,
      req.totalDays
    );

    async function requestValidated<T>(prompt: string, schema: Record<string, unknown>, maxTokens: number, parse: (text: string) => T, stage: string): Promise<T> {
      let feedback = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await client.messages.create({
          model: MODEL_ID,
          max_tokens: maxTokens,
          output_config: { format: { type: "json_schema", schema } },
          messages: [{ role: "user", content: prompt + feedback }],
        }, { signal: deadline });
        totalInputTokens += response.usage.input_tokens;
        totalOutputTokens += response.usage.output_tokens;
        try {
          if (response.stop_reason === "max_tokens") throw new Error("AI_OUTPUT_TRUNCATED");
          if (response.stop_reason === "refusal") throw new Error("AI_OUTPUT_REFUSED");
          return parse(response.content.filter(b => b.type === "text").map(b => b.text).join(""));
        } catch (error) {
          if (attempt === 1 || response.stop_reason === "refusal") throw new Error(`${error instanceof Error ? error.message : "AI_INVALID_CONTENT"}:${stage}`);
          const code = error instanceof Error ? error.message : "AI_INVALID_CONTENT";
          console.warn("[generation] correcting provider output", { code });
          feedback = `\nالمحاولة السابقة لم تجتز التحقق (${code}). أعد النتيجة كاملة وفق العدد والحقول ومراجع الصفحات واللغة المحددة. لا تختصر العدد ولا تترك حقولاً فارغة.`;
        }
      }
      throw new Error("AI_INVALID_CONTENT");
    }
    const days = await requestValidated(dayPlanPrompt, dayPlanSchema, 8192, text => parseDayPlans(text, req.totalDays, req.pages), "PLAN");

    if (req.assessmentType === "FINAL") {
      // Each question type spans the entire document, rather than only its first pages.
      for (const type of ["MULTIPLE_CHOICE", "TRUE_FALSE"] as const) {
        const sections = days.filter(day => req.questionTypesByDay?.[day.dayNumber] === type);
        sections.forEach((day, index) => {
          const start = Math.floor(index * req.pages.length / sections.length);
          const end = Math.floor((index + 1) * req.pages.length / sections.length);
          const pages = req.pages.slice(start, end);
          day.sourcePages = (pages.length ? pages : [req.pages[index % req.pages.length]]).map(p => p.pageNumber);
          day.pageRangeStart = day.sourcePages[0]; day.pageRangeEnd = day.sourcePages[day.sourcePages.length - 1];
        });
      }
    }

    // ── Step 2: Generate questions for each day ───────────────────────────────

    const allQuestions: GeneratedQuestion[] = [];

    // Two days at a time keep the 10-day course within the serverless budget.
    for (let offset = 0; offset < days.length; offset += 2) {
      const batch = await Promise.all(days.slice(offset, offset + 2).map(async day => {
        const existingTexts = [...(req.existingQuestionTexts ?? []), ...allQuestions.map((q) => q.questionText)];

        const questionType = req.questionTypesByDay?.[day.dayNumber] ?? "MULTIPLE_CHOICE";
        const qPrompt = purpose + buildQuestionsPrompt(
          day,
          req.pages,
          req.language,
          req.questionsPerDay,
          existingTexts, questionType, req.assessmentType === "FINAL"
        );

        const dayQuestions = await requestValidated(qPrompt, questionType === "TRUE_FALSE" ? trueFalseSchema : questionSchema, 8192, text => {
          const questions = parseQuestions(text, day.dayNumber, req.questionsPerDay, questionType);
          if (questionType === "TRUE_FALSE" && questions.some(q => q.options[0].text !== (req.language === "AR" ? "صح" : "True") || q.options[1].text !== (req.language === "AR" ? "خطأ" : "False"))) throw new Error("AI_INVALID_CONTENT");
          if (req.assessmentType === "FINAL") {
            const normalize = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
            const seen = new Set(existingTexts.map(normalize));
            for (const q of questions) { const key = normalize(q.questionText); if (seen.has(key)) throw new Error("AI_DUPLICATE_FINAL_QUESTION"); seen.add(key); }
          }
          if (questions.some(q => !day.sourcePages.includes(q.sourcePageNumber))) throw new Error("AI_INVALID_SOURCE_PAGE");
          if (req.language === "AR" && questions.some(q => !/[\u0600-\u06FF]/.test(q.questionText) || q.options.some(o => !/[\u0600-\u06FF]/.test(o.text)))) throw new Error("AI_LANGUAGE_MISMATCH_AR");
          return questions;
        }, `DAY_${day.dayNumber}`);
        return dayQuestions;
      }));
      allQuestions.push(...batch.flat());
      await req.onProgress?.(Math.min(offset + batch.length, days.length));
    }

    if (req.language === "AR") {
      const arabicPattern = /[\u0600-\u06FF]/;
      const invalidQuestion = allQuestions.find(
        (q) =>
          !arabicPattern.test(q.questionText) ||
          q.options.some((opt) => !arabicPattern.test(opt.text))
      );
      if (invalidQuestion) {
        throw new Error("AI_LANGUAGE_MISMATCH_AR");
      }
    }

    return {
      days,
      questions: allQuestions,
      modelUsed: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      generatedAt: new Date(),
    };
  }
}

// ── JSON parsing helpers ──────────────────────────────────────────────────────

function extractJson(text: string): unknown {
  // Strip markdown code fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1] : text;
  // Find first { or [ and last } or ]
  const start = raw.search(/[{[]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("No JSON found in AI response");
  return JSON.parse(raw.slice(start, end + 1));
}

function parseDayPlans(
  text: string,
  totalDays: number,
  pages: Array<{ pageNumber: number }>
): GeneratedDayPlan[] {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error("AI_INVALID_CONTENT");
  }

  const raw = parsed as { days?: unknown[] };
  if (!Array.isArray(raw?.days) || raw.days.length !== totalDays) throw new Error("AI_INCOMPLETE_CONTENT");

  const days: GeneratedDayPlan[] = raw.days.slice(0, totalDays).map((d: unknown, i) => {
    const day = d as Record<string, unknown>;
    return {
      dayNumber: typeof day.dayNumber === "number" ? day.dayNumber : i + 1,
      title: typeof day.title === "string" ? day.title : `اليوم ${i + 1}`,
      objectives: Array.isArray(day.objectives) ? (day.objectives as string[]) : [],
      contentSummary: typeof day.contentSummary === "string" ? day.contentSummary : "",
      topics: Array.isArray(day.topics) ? (day.topics as string[]) : [],
      pageRangeStart: typeof day.pageRangeStart === "number" ? day.pageRangeStart : 1,
      pageRangeEnd: typeof day.pageRangeEnd === "number" ? day.pageRangeEnd : pages.length,
      sourcePages: Array.isArray(day.sourcePages) ? (day.sourcePages as number[]) : [],
    };
  });

  const available = new Set(pages.map(p => p.pageNumber));
  if (days.some((day, i) => day.dayNumber !== i + 1 || !day.title.trim() || !day.sourcePages.length || day.sourcePages.some(n => !available.has(n)))) throw new Error("AI_INVALID_DAY_PLAN");
  return days;
}

function parseQuestions(
  text: string,
  dayNumber: number,
  questionsPerDay: number,
  questionType: "MULTIPLE_CHOICE" | "TRUE_FALSE" = "MULTIPLE_CHOICE"
): GeneratedQuestion[] {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error("AI_INVALID_CONTENT");
  }

  const raw = parsed as { questions?: unknown[] };
  if (!Array.isArray(raw?.questions) || raw.questions.length !== questionsPerDay) throw new Error("AI_INCOMPLETE_CONTENT");

  const labels = questionType === "TRUE_FALSE" ? ["A", "B"] : ["A", "B", "C", "D"];
  const validLabels = new Set(labels);
  const validDifficulties = new Set(["EASY", "MEDIUM", "HARD"]);

  return raw.questions
    .slice(0, questionsPerDay)
    .map((q: unknown, i) => {
      const item = q as Record<string, unknown>;
      const options = Array.isArray(item.options) ? item.options as Array<Record<string, string>> : [];
      if (options.length !== labels.length || new Set(options.map(o => o.label)).size !== labels.length ||
          options.some(o => !validLabels.has(o.label) || typeof o.text !== "string" || !o.text.trim()) ||
          !validLabels.has(item.correctLabel as string) || !Number.isInteger(item.sourcePageNumber) ||
          typeof item.questionText !== "string" || !item.questionText.trim() || typeof item.explanation !== "string" || !item.explanation.trim()) {
        throw new Error("AI_INVALID_CONTENT");
      }
      const correctLabel = item.correctLabel as "A" | "B" | "C" | "D";

      return {
        questionType,
        questionText: typeof item.questionText === "string" ? item.questionText : "",
        options: labels.map((label) => {
          const opt = options.find((o) => o.label === label);
          return { label: label as "A" | "B" | "C" | "D", text: typeof opt?.text === "string" ? opt.text : "" };
        }),
        correctLabel,
        explanation: typeof item.explanation === "string" ? item.explanation : "",
        dayNumber,
        questionOrder: i + 1,
        sourcePageNumber: typeof item.sourcePageNumber === "number" ? item.sourcePageNumber : 1,
        topic: typeof item.topic === "string" ? item.topic : undefined,
        difficulty: validDifficulties.has(item.difficulty as string)
          ? (item.difficulty as "EASY" | "MEDIUM" | "HARD")
          : "MEDIUM",
      } satisfies GeneratedQuestion;
    })
    .filter((q) => q.questionText.length > 0);
}
