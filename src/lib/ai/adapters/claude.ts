// ClaudeAIAdapter — primary AI adapter using Anthropic Claude API.
// API key is read from ANTHROPIC_API_KEY env at call time — never logged,
// never sent to any endpoint other than api.anthropic.com.

import Anthropic from "@anthropic-ai/sdk";
import type { AIAdapter, ContentGenerationRequest, ContentGenerationResult, GeneratedDayPlan, GeneratedQuestion } from "../types";
import { buildDayPlanPrompt, buildQuestionsPrompt, PROMPT_VERSION } from "../prompts";

const MODEL_ID = "claude-haiku-4-5-20251001";

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

    const dayPlanPrompt = buildDayPlanPrompt(
      req.pages,
      req.programTitle,
      req.language,
      req.totalDays
    );

    const dayPlanResponse = await client.messages.create({
      model: MODEL_ID,
      max_tokens: 8192,
      messages: [{ role: "user", content: dayPlanPrompt }],
    }, { signal: deadline });

    totalInputTokens += dayPlanResponse.usage.input_tokens;
    totalOutputTokens += dayPlanResponse.usage.output_tokens;

    const dayPlanText = dayPlanResponse.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    const days = parseDayPlans(dayPlanText, req.totalDays, req.pages);

    // ── Step 2: Generate questions for each day ───────────────────────────────

    const allQuestions: GeneratedQuestion[] = [];

    // Two days at a time keep the 10-day course within the serverless budget.
    for (let offset = 0; offset < days.length; offset += 2) {
      const batch = await Promise.all(days.slice(offset, offset + 2).map(async day => {
        const existingTexts = allQuestions.map((q) => q.questionText);

        const qPrompt = buildQuestionsPrompt(
          day,
          req.pages,
          req.language,
          req.questionsPerDay,
          existingTexts
        );

        const qResponse = await client.messages.create({
          model: MODEL_ID,
          max_tokens: 4096,
          messages: [{ role: "user", content: qPrompt }],
        }, { signal: deadline });

        totalInputTokens += qResponse.usage.input_tokens;
        totalOutputTokens += qResponse.usage.output_tokens;

        const qText = qResponse.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");

        const dayQuestions = parseQuestions(qText, day.dayNumber, req.questionsPerDay);
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

  return days;
}

function parseQuestions(
  text: string,
  dayNumber: number,
  questionsPerDay: number
): GeneratedQuestion[] {
  let parsed: unknown;
  try {
    parsed = extractJson(text);
  } catch {
    throw new Error("AI_INVALID_CONTENT");
  }

  const raw = parsed as { questions?: unknown[] };
  if (!Array.isArray(raw?.questions) || raw.questions.length !== questionsPerDay) throw new Error("AI_INCOMPLETE_CONTENT");

  const validLabels = new Set(["A", "B", "C", "D"]);
  const validDifficulties = new Set(["EASY", "MEDIUM", "HARD"]);

  return raw.questions
    .slice(0, questionsPerDay)
    .map((q: unknown, i) => {
      const item = q as Record<string, unknown>;
      const options = Array.isArray(item.options) ? item.options as Array<Record<string, string>> : [];
      if (options.length !== 4 || new Set(options.map(o => o.label)).size !== 4 ||
          options.some(o => !validLabels.has(o.label) || typeof o.text !== "string" || !o.text.trim()) ||
          !validLabels.has(item.correctLabel as string) || typeof item.sourcePageNumber !== "number") {
        throw new Error("AI_INVALID_CONTENT");
      }
      const correctLabel = item.correctLabel as "A" | "B" | "C" | "D";

      return {
        questionText: typeof item.questionText === "string" ? item.questionText : "",
        options: ["A", "B", "C", "D"].map((label) => {
          const opt = options.find((o) => o.label === label);
          return { label: label as "A" | "B" | "C" | "D", text: typeof opt?.text === "string" ? opt.text : "" };
        }),
        correctLabel,
        explanation: typeof item.explanation === "string" ? item.explanation : "",
        dayNumber,
        questionOrder: typeof item.questionOrder === "number" ? item.questionOrder : i + 1,
        sourcePageNumber: typeof item.sourcePageNumber === "number" ? item.sourcePageNumber : 1,
        topic: typeof item.topic === "string" ? item.topic : undefined,
        difficulty: validDifficulties.has(item.difficulty as string)
          ? (item.difficulty as "EASY" | "MEDIUM" | "HARD")
          : "MEDIUM",
      } satisfies GeneratedQuestion;
    })
    .filter((q) => q.questionText.length > 0);
}
