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

const MODEL_ID = process.env.OPENAI_MODEL || "gpt-5.6-luna";
const MAX_GENERATION_ATTEMPTS = 2;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number };
};

async function respond(
  prompt: string
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY env var not set");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      input: prompt,
      max_output_tokens: 30000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `OPENAI_API_ERROR_${response.status}: ${body.slice(0, 500)}`
    );
  }

  const data = (await response.json()) as OpenAIResponse;
  const text =
    data.output_text ??
    data.output
      ?.flatMap((output) => output.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    "";

  if (!text.trim()) throw new Error("OPENAI_EMPTY_RESPONSE");

  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

export class OpenAIAdapter implements AIAdapter {
  readonly name = "OPENAI";
  readonly modelId = MODEL_ID;

  async generate(
    req: ContentGenerationRequest
  ): Promise<ContentGenerationResult> {
    let inputTokens = 0;
    let outputTokens = 0;
    const validPageNumbers = new Set(req.pages.map((page) => page.pageNumber));

    let days: GeneratedDayPlan[] | null = null;
    let dayPlanFailure = "";

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      const repair =
        attempt > 1
          ? `\n\nتصحيح إلزامي للمحاولة السابقة: ${dayPlanFailure}. أعد الخطة كاملة من البداية، ${req.totalDays} أيام بالضبط، ولا تعِد جزءًا منها فقط.`
          : "";

      const planResponse = await respond(
        buildDayPlanPrompt(
          req.pages,
          req.programTitle,
          req.language,
          req.totalDays
        ) + repair
      );
      inputTokens += planResponse.inputTokens;
      outputTokens += planResponse.outputTokens;

      try {
        const candidate = parseDayPlans(planResponse.text, req.totalDays);
        const validation = validateDayPlans(
          candidate,
          req,
          validPageNumbers
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
        `AI_DAY_PLAN_VALIDATION_FAILED: ${dayPlanFailure || "unknown"}`
      );
    }

    const questions: GeneratedQuestion[] = [];
    const QUESTION_CONCURRENCY = 2;

    const generateDayQuestions = async (
      day: GeneratedDayPlan,
      priorQuestionTexts: string[]
    ): Promise<{
      dayNumber: number;
      accepted: GeneratedQuestion[];
      inputTokens: number;
      outputTokens: number;
    }> => {
      let accepted: GeneratedQuestion[] | null = null;
      let failure = "";
      let dayInputTokens = 0;
      let dayOutputTokens = 0;

      for (
        let attempt = 1;
        attempt <= MAX_GENERATION_ATTEMPTS;
        attempt++
      ) {
        const repair =
          attempt > 1
            ? `\n\nتصحيح إلزامي للمحاولة السابقة: ${failure}. أعد ${req.questionsPerDay} أسئلة كاملة لهذا اليوم فقط. لا تحذف سؤالًا ولا تستخدم لغة غير اللغة المطلوبة.`
            : "";

        const questionResponse = await respond(
          buildQuestionsPrompt(
            day,
            req.pages,
            req.language,
            req.questionsPerDay,
            priorQuestionTexts
          ) + repair
        );
        dayInputTokens += questionResponse.inputTokens;
        dayOutputTokens += questionResponse.outputTokens;

        try {
          const candidate = parseQuestions(
            questionResponse.text,
            day.dayNumber,
            req.questionsPerDay
          );
          const validation = validateQuestions(
            candidate,
            day,
            req,
            validPageNumbers
          );

          if (!validation) {
            accepted = candidate;
            break;
          }

          failure = validation;
        } catch (error) {
          failure =
            error instanceof Error ? error.message : "INVALID_QUESTIONS";
        }
      }

      if (!accepted) {
        throw new Error(
          `AI_QUESTIONS_VALIDATION_FAILED_DAY_${day.dayNumber}: ${failure || "unknown"}`
        );
      }

      return {
        dayNumber: day.dayNumber,
        accepted,
        inputTokens: dayInputTokens,
        outputTokens: dayOutputTokens,
      };
    };

    // Two days at a time keeps the total generation under serverless time
    // limits while staying conservative with provider rate limits. Each batch
    // still sees all questions accepted by earlier batches, preserving the
    // duplicate-avoidance context across the course.
    for (let index = 0; index < days.length; index += QUESTION_CONCURRENCY) {
      const batch = days.slice(index, index + QUESTION_CONCURRENCY);
      const priorQuestionTexts = questions.map(
        (question) => question.questionText
      );

      const generated = await Promise.all(
        batch.map((day) =>
          generateDayQuestions(day, priorQuestionTexts)
        )
      );

      generated
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .forEach((result) => {
          inputTokens += result.inputTokens;
          outputTokens += result.outputTokens;
          questions.push(...result.accepted);
        });
    }

    if (questions.length !== req.totalDays * req.questionsPerDay) {
      throw new Error(
        `AI_QUESTION_TOTAL_MISMATCH: got ${questions.length}, expected ${req.totalDays * req.questionsPerDay}`
      );
    }

    return {
      days,
      questions,
      modelUsed: MODEL_ID,
      promptVersion: PROMPT_VERSION,
      inputTokens,
      outputTokens,
      generatedAt: new Date(),
    };
  }
}

function validateDayPlans(
  days: GeneratedDayPlan[],
  req: ContentGenerationRequest,
  validPageNumbers: Set<number>
): string | null {
  if (days.length !== req.totalDays) {
    return `عدد الأيام ${days.length} وليس ${req.totalDays}`;
  }

  const dayNumbers = new Set<number>();

  for (const day of days) {
    if (
      !Number.isInteger(day.dayNumber) ||
      day.dayNumber < 1 ||
      day.dayNumber > req.totalDays ||
      dayNumbers.has(day.dayNumber)
    ) {
      return `رقم يوم غير صالح أو مكرر: ${day.dayNumber}`;
    }
    dayNumbers.add(day.dayNumber);

    if (!day.title.trim() || !day.contentSummary.trim()) {
      return `اليوم ${day.dayNumber} بلا عنوان أو ملخص`;
    }
    if (day.objectives.length < 2 || day.topics.length < 2) {
      return `اليوم ${day.dayNumber} يحتاج هدفين وموضوعين على الأقل`;
    }
    if (day.sourcePages.length === 0) {
      return `اليوم ${day.dayNumber} بلا صفحات مصدر`;
    }
    if (day.sourcePages.some((page) => !validPageNumbers.has(page))) {
      return `اليوم ${day.dayNumber} يحتوي رقم صفحة مصدر غير موجود`;
    }

    if (req.language === "AR") {
      if (
        !isPredominantlyArabic(day.title) ||
        !isPredominantlyArabic(day.contentSummary) ||
        day.objectives.some((value) => !isPredominantlyArabic(value)) ||
        day.topics.some((value) => !isPredominantlyArabic(value))
      ) {
        return `اليوم ${day.dayNumber} لا يلتزم باللغة العربية`;
      }
    }
  }

  return null;
}

function validateQuestions(
  questions: GeneratedQuestion[],
  day: GeneratedDayPlan,
  req: ContentGenerationRequest,
  validPageNumbers: Set<number>
): string | null {
  if (questions.length !== req.questionsPerDay) {
    return `تم إنشاء ${questions.length} أسئلة بدل ${req.questionsPerDay}`;
  }

  const orders = new Set<number>();
  const dayPages = new Set(day.sourcePages);

  for (const question of questions) {
    if (!question.questionText.trim()) return "يوجد سؤال بلا نص";
    if (!question.explanation.trim()) return "يوجد سؤال بلا تفسير";
    if (
      !Number.isInteger(question.questionOrder) ||
      question.questionOrder < 1 ||
      question.questionOrder > req.questionsPerDay ||
      orders.has(question.questionOrder)
    ) {
      return "ترتيب الأسئلة ناقص أو مكرر";
    }
    orders.add(question.questionOrder);

    if (
      !validPageNumbers.has(question.sourcePageNumber) ||
      !dayPages.has(question.sourcePageNumber)
    ) {
      return `السؤال ${question.questionOrder} يشير إلى صفحة خارج مصادر اليوم`;
    }

    if (question.options.length !== 4) {
      return `السؤال ${question.questionOrder} لا يحتوي أربعة خيارات`;
    }
    if (question.options.some((option) => !option.text.trim())) {
      return `السؤال ${question.questionOrder} يحتوي خيارًا فارغًا`;
    }
    if (
      !question.options.some(
        (option) => option.label === question.correctLabel
      )
    ) {
      return `السؤال ${question.questionOrder} لا يحتوي الإجابة الصحيحة المحددة`;
    }

    if (
      req.language === "AR" &&
      (!isArabicQuestionContent(question.questionText, question.options) ||
        !isPredominantlyArabic(question.explanation))
    ) {
      return `السؤال ${question.questionOrder} أو خياراته/تفسيره ليس بالعربية`;
    }
  }

  return null;
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.search(/[{[]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  if (start < 0 || end < 0) throw new Error("NO_JSON_FOUND");
  return JSON.parse(raw.slice(start, end + 1));
}

function parseDayPlans(
  text: string,
  totalDays: number
): GeneratedDayPlan[] {
  const parsed = extractJson(text) as { days?: unknown[] };
  if (!Array.isArray(parsed.days)) throw new Error("INVALID_DAY_PLAN");

  return parsed.days.slice(0, totalDays).map((day, index) => {
    const value = day as Record<string, unknown>;
    return {
      dayNumber:
        typeof value.dayNumber === "number"
          ? value.dayNumber
          : index + 1,
      title: String(value.title ?? ""),
      objectives: Array.isArray(value.objectives)
        ? value.objectives.map(String)
        : [],
      contentSummary: String(value.contentSummary ?? ""),
      topics: Array.isArray(value.topics)
        ? value.topics.map(String)
        : [],
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
  limit: number
): GeneratedQuestion[] {
  const parsed = extractJson(text) as { questions?: unknown[] };
  if (!Array.isArray(parsed.questions)) {
    throw new Error("INVALID_QUESTIONS");
  }

  return parsed.questions.slice(0, limit).map((question, index) => {
    const value = question as Record<string, unknown>;
    const rawOptions = Array.isArray(value.options)
      ? (value.options as Array<Record<string, unknown>>)
      : [];

    const options = (["A", "B", "C", "D"] as const).map((label) => ({
      label,
      text: String(
        rawOptions.find(
          (option) => String(option.label).toUpperCase() === label
        )?.text ?? ""
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
      topic:
        typeof value.topic === "string" ? value.topic : undefined,
      difficulty: ["EASY", "MEDIUM", "HARD"].includes(
        String(value.difficulty)
      )
        ? (value.difficulty as "EASY" | "MEDIUM" | "HARD")
        : "MEDIUM",
    };
  });
}
