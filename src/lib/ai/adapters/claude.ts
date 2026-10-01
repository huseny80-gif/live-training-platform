import Anthropic from "@anthropic-ai/sdk";
import type {
  AIAdapter,
  ContentGenerationRequest,
  ContentGenerationResult,
  GeneratedDayPlan,
  GeneratedQuestion,
} from "../types";
import {
  buildDayPlanPrompt,
  buildQuestionsPrompt,
  PROMPT_VERSION,
} from "../prompts";
import {
  isArabicQuestionContent,
  isPredominantlyArabic,
} from "@/lib/language";

const MODEL_ID =
  process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";
const MAX_GENERATION_ATTEMPTS = 4;

function extractJson(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenceMatch ? fenceMatch[1] : text;
  const start = raw.search(/[{[]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start === -1 || end === -1) throw new Error("NO_JSON_FOUND");
  return JSON.parse(raw.slice(start, end + 1));
}

function parseDayPlans(text: string, totalDays: number): GeneratedDayPlan[] {
  const parsed = extractJson(text) as { days?: unknown[] };
  if (!Array.isArray(parsed.days)) throw new Error("INVALID_DAY_PLAN");

  return parsed.days.slice(0, totalDays).map((day, index) => {
    const value = day as Record<string, unknown>;
    return {
      dayNumber:
        typeof value.dayNumber === "number" ? value.dayNumber : index + 1,
      title: String(value.title ?? ""),
      objectives: Array.isArray(value.objectives)
        ? value.objectives.map(String)
        : [],
      contentSummary: String(value.contentSummary ?? ""),
      topics: Array.isArray(value.topics) ? value.topics.map(String) : [],
      pageRangeStart: Number(value.pageRangeStart),
      pageRangeEnd: Number(value.pageRangeEnd),
      sourcePages: Array.isArray(value.sourcePages)
        ? value.sourcePages.map(Number).filter(Number.isFinite)
        : [],
    };
  });
}

function parseQuestions(
  text: string,
  dayNumber: number,
  limit: number,
): GeneratedQuestion[] {
  const parsed = extractJson(text) as { questions?: unknown[] };
  if (!Array.isArray(parsed.questions)) throw new Error("INVALID_QUESTIONS");

  return parsed.questions.slice(0, limit).map((question, index) => {
    const value = question as Record<string, unknown>;
    const rawOptions = Array.isArray(value.options)
      ? (value.options as Array<Record<string, unknown>>)
      : [];

    const options = (["A", "B", "C", "D"] as const).map((label) => ({
      label,
      text: String(
        rawOptions.find(
          (option) => String(option.label).toUpperCase() === label,
        )?.text ?? "",
      ),
    }));

    const rawLabel = String(value.correctLabel ?? "").toUpperCase();
    const correctLabel = (
      ["A", "B", "C", "D"].includes(rawLabel) ? rawLabel : ""
    ) as "A" | "B" | "C" | "D";

    return {
      questionText: String(value.questionText ?? ""),
      options,
      correctLabel,
      explanation: String(value.explanation ?? ""),
      dayNumber,
      questionOrder:
        typeof value.questionOrder === "number"
          ? value.questionOrder
          : index + 1,
      sourcePageNumber: Number(value.sourcePageNumber),
      topic: typeof value.topic === "string" ? value.topic : undefined,
      difficulty: ["EASY", "MEDIUM", "HARD"].includes(
        String(value.difficulty),
      )
        ? (value.difficulty as "EASY" | "MEDIUM" | "HARD")
        : "MEDIUM",
    };
  });
}

function validateDayPlans(
  days: GeneratedDayPlan[],
  req: ContentGenerationRequest,
  validPageNumbers: Set<number>,
): string | null {
  if (days.length !== req.totalDays) {
    return `عدد الأيام ${days.length} وليس ${req.totalDays}`;
  }

  const seen = new Set<number>();
  for (const day of days) {
    if (
      !Number.isInteger(day.dayNumber) ||
      day.dayNumber < 1 ||
      day.dayNumber > req.totalDays ||
      seen.has(day.dayNumber)
    ) {
      return `رقم يوم غير صالح أو مكرر: ${day.dayNumber}`;
    }
    seen.add(day.dayNumber);

    if (!day.title.trim() || !day.contentSummary.trim()) {
      return `اليوم ${day.dayNumber} بلا عنوان أو ملخص`;
    }
    if (day.objectives.length < 2 || day.topics.length < 2) {
      return `اليوم ${day.dayNumber} يحتاج هدفين وموضوعين على الأقل`;
    }
    if (
      day.sourcePages.length === 0 ||
      day.sourcePages.some((page) => !validPageNumbers.has(page))
    ) {
      return `اليوم ${day.dayNumber} يحتوي صفحات مصدر غير صالحة`;
    }

    if (
      req.language === "AR" &&
      (!isPredominantlyArabic(day.title) ||
        !isPredominantlyArabic(day.contentSummary) ||
        day.objectives.some((value) => !isPredominantlyArabic(value)) ||
        day.topics.some((value) => !isPredominantlyArabic(value)))
    ) {
      return `اليوم ${day.dayNumber} لا يلتزم باللغة العربية`;
    }
  }

  return null;
}

function validateSingleQuestion(
  question: GeneratedQuestion,
  day: GeneratedDayPlan,
  req: ContentGenerationRequest,
  validPageNumbers: Set<number>,
): string | null {
  if (!question.questionText.trim()) return "يوجد سؤال بلا نص";
  if (!question.explanation.trim()) return "يوجد سؤال بلا تفسير";

  const dayPages = new Set(day.sourcePages);
  if (
    !validPageNumbers.has(question.sourcePageNumber) ||
    !dayPages.has(question.sourcePageNumber)
  ) {
    return `السؤال يشير إلى صفحة خارج مصادر اليوم: ${question.sourcePageNumber}`;
  }

  if (question.options.length !== 4) return "السؤال لا يحتوي أربعة خيارات";
  if (question.options.some((option) => !option.text.trim())) {
    return "السؤال يحتوي خيارًا فارغًا";
  }
  if (
    !question.options.some(
      (option) => option.label === question.correctLabel,
    )
  ) {
    return "السؤال لا يحتوي الإجابة الصحيحة المحددة";
  }

  if (
    req.language === "AR" &&
    (!isArabicQuestionContent(question.questionText, question.options) ||
      !isPredominantlyArabic(question.explanation))
  ) {
    return "السؤال أو خياراته/تفسيره ليس بالعربية";
  }

  return null;
}

export class ClaudeAIAdapter implements AIAdapter {
  readonly name = "CLAUDE";
  readonly modelId = MODEL_ID;

  async generate(
    req: ContentGenerationRequest,
  ): Promise<ContentGenerationResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var not set");

    const client = new Anthropic({ apiKey });
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    const validPageNumbers = new Set(req.pages.map((page) => page.pageNumber));

    const respond = async (prompt: string, maxTokens: number) => {
      const response = await client.messages.create({
        model: MODEL_ID,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const text = response.content
        .filter((block) => block.type === "text")
        .map((block) => (block as { type: "text"; text: string }).text)
        .join("");

      if (!text.trim()) throw new Error("ANTHROPIC_EMPTY_RESPONSE");
      return text;
    };

    let days: GeneratedDayPlan[] | null = null;
    let dayPlanFailure = "";

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const repair =
        attempt > 1
          ? `\n\nتصحيح إلزامي للمحاولة السابقة: ${dayPlanFailure}. أعد الخطة كاملة: ${req.totalDays} أيام بالضبط وباللغة المطلوبة وصفحات مصدر صحيحة.`
          : "";

      try {
        const text = await respond(
          buildDayPlanPrompt(
            req.pages,
            req.programTitle,
            req.language,
            req.totalDays,
          ) + repair,
          7000,
        );
        const candidate = parseDayPlans(text, req.totalDays);
        const validation = validateDayPlans(
          candidate,
          req,
          validPageNumbers,
        );
        if (!validation) {
          days = candidate;
          break;
        }
        dayPlanFailure = validation;
      } catch (error) {
        dayPlanFailure =
          error instanceof Error ? error.message : "INVALID_DAY_PLAN";
      }
    }

    if (!days) {
      throw new Error(
        `AI_DAY_PLAN_VALIDATION_FAILED: ${dayPlanFailure || "unknown"}`,
      );
    }

    const questions: GeneratedQuestion[] = [];

    for (const day of days) {
      const acceptedByText = new Map<string, GeneratedQuestion>();
      const candidateCount = Math.max(
        req.questionsPerDay + 3,
        req.questionsPerDay,
      );
      let failure = "";

      for (
        let attempt = 1;
        attempt <= MAX_GENERATION_ATTEMPTS &&
        acceptedByText.size < req.questionsPerDay;
        attempt++
      ) {
        const missing = req.questionsPerDay - acceptedByText.size;
        const repair =
          attempt > 1
            ? `\n\nتصحيح إلزامي: ${failure}. ما زلنا نحتاج ${missing} سؤال/أسئلة صالحة على الأقل. أعد مجموعة مرشحة جديدة بالعربية ومن صفحات هذا اليوم فقط.`
            : "";

        try {
          const text = await respond(
            buildQuestionsPrompt(
              day,
              req.pages,
              req.language,
              candidateCount,
              [
                ...questions.map((question) => question.questionText),
                ...Array.from(acceptedByText.values()).map(
                  (question) => question.questionText,
                ),
              ],
            ) + repair,
            7000,
          );

          const candidates = parseQuestions(
            text,
            day.dayNumber,
            candidateCount,
          );
          const reasons: string[] = [];

          for (const candidate of candidates) {
            const validation = validateSingleQuestion(
              candidate,
              day,
              req,
              validPageNumbers,
            );
            if (validation) {
              reasons.push(validation);
              continue;
            }

            const key = candidate.questionText
              .trim()
              .toLocaleLowerCase("ar")
              .replace(/\s+/g, " ");
            if (!key || acceptedByText.has(key)) continue;

            acceptedByText.set(key, candidate);
            if (acceptedByText.size >= req.questionsPerDay) break;
          }

          if (acceptedByText.size < req.questionsPerDay) {
            failure =
              `تم قبول ${acceptedByText.size}/${req.questionsPerDay} فقط` +
              (reasons.length ? `: ${reasons.slice(0, 3).join(" | ")}` : "");
          }
        } catch (error) {
          failure =
            error instanceof Error ? error.message : "INVALID_QUESTIONS";
        }
      }

      if (acceptedByText.size < req.questionsPerDay) {
        throw new Error(
          `AI_QUESTIONS_VALIDATION_FAILED_DAY_${day.dayNumber}: ${failure || "unknown"}`,
        );
      }

      questions.push(
        ...Array.from(acceptedByText.values())
          .slice(0, req.questionsPerDay)
          .map((question, index) => ({
            ...question,
            dayNumber: day.dayNumber,
            questionOrder: index + 1,
          })),
      );
    }

    if (questions.length !== req.totalDays * req.questionsPerDay) {
      throw new Error(
        `AI_QUESTION_TOTAL_MISMATCH: got ${questions.length}, expected ${req.totalDays * req.questionsPerDay}`,
      );
    }

    return {
      days,
      questions,
      modelUsed: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      generatedAt: new Date(),
    };
  }
}
