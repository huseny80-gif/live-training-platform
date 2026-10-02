"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isArabicQuestionContent, isPredominantlyArabic } from "@/lib/language";
import { extractionService } from "@/lib/extraction/service";
import { extractionErrorToArabic } from "@/lib/extraction/errors";

export type FinalQuestion = {
  type: "MCQ" | "TF";
  text: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  sourcePage: number;
};

export type FinalQuestionsState =
  | {
      ok: false;
      error: string;
      code?: "SOURCE_NOT_READY" | "GENERATION_FAILED";
      documentId?: string;
    }
  | {
      ok: true;
      summary: string;
      questions: FinalQuestion[];
      googleAppsScript: string;
      sourceFileName: string;
      sourcePageCount: number;
    };

type ParsedBatch = {
  summary?: string;
  questions?: FinalQuestion[];
};

type FinalQuestionType = "MCQ" | "TF";

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("INVALID_JSON");
  return raw.slice(start, end + 1);
}

function validateOneQuestion(
  question: FinalQuestion,
  expectedType: FinalQuestionType,
  validPages: Set<number>,
  requireArabic: boolean,
): string | null {
  if (!question || question.type !== expectedType) {
    return `نوع السؤال يجب أن يكون ${expectedType}.`;
  }
  if (typeof question.text !== "string" || question.text.trim().length < 5) {
    return "السؤال لا يحتوي نصًا صالحًا.";
  }
  if (
    typeof question.explanation !== "string" ||
    question.explanation.trim().length < 3
  ) {
    return "السؤال لا يحتوي شرحًا صالحًا.";
  }
  if (
    !Number.isInteger(question.sourcePage) ||
    !validPages.has(question.sourcePage)
  ) {
    return "السؤال يشير إلى صفحة مصدر غير صالحة.";
  }

  if (expectedType === "MCQ") {
    if (!Array.isArray(question.options) || question.options.length !== 4) {
      return "سؤال الاختيار من متعدد يجب أن يحتوي أربعة خيارات.";
    }
    if (
      question.options.some(
        (option) => typeof option !== "string" || option.trim().length === 0,
      )
    ) {
      return "أحد خيارات السؤال فارغ.";
    }
    if (!question.options.includes(question.correctAnswer)) {
      return "الإجابة الصحيحة ليست واحدة من الخيارات الأربعة.";
    }

    if (
      requireArabic &&
      !isArabicQuestionContent(
        question.text,
        question.options.map((text) => ({ text })),
      )
    ) {
      return "نص السؤال أو خياراته لا يطابق متطلبات اللغة العربية.";
    }
  } else if (
    question.correctAnswer !== "TRUE" &&
    question.correctAnswer !== "FALSE"
  ) {
    return "إجابة سؤال الصح/الخطأ يجب أن تكون TRUE أو FALSE.";
  }

  if (
    requireArabic &&
    (!isPredominantlyArabic(question.text) ||
      !isPredominantlyArabic(question.explanation))
  ) {
    return "نص السؤال أو شرحه ليس بالعربية.";
  }

  return null;
}

function validateBatch(
  parsed: ParsedBatch,
  expectedType: FinalQuestionType,
  expectedCount: number,
  validPages: Set<number>,
  requireArabic: boolean,
  requireSummary: boolean,
): string | null {
  if (!parsed || !Array.isArray(parsed.questions)) {
    return "بنية الاستجابة غير صحيحة أو لا تحتوي قائمة أسئلة.";
  }

  if (parsed.questions.length !== expectedCount) {
    return `تم إنشاء ${parsed.questions.length} سؤالًا بدل ${expectedCount} من نوع ${expectedType}.`;
  }

  if (requireSummary) {
    if (typeof parsed.summary !== "string" || parsed.summary.trim().length < 20) {
      return "الملخص النهائي غير موجود أو قصير جدًا.";
    }
    if (requireArabic && !isPredominantlyArabic(parsed.summary)) {
      return "ملخص المادة ليس بالعربية.";
    }
  }

  const seen = new Set<string>();
  for (const [index, question] of parsed.questions.entries()) {
    const error = validateOneQuestion(
      question,
      expectedType,
      validPages,
      requireArabic,
    );
    if (error) return `السؤال رقم ${index + 1}: ${error}`;

    const key = question.text.trim().toLocaleLowerCase("ar").replace(/\s+/g, " ");
    if (seen.has(key)) {
      return `السؤال رقم ${index + 1} مكرر.`;
    }
    seen.add(key);
  }

  return null;
}

function buildBatchPrompt(params: {
  source: string;
  programTitle: string;
  requireArabic: boolean;
  type: FinalQuestionType;
  count: number;
  includeSummary: boolean;
  previousFailure?: string;
}): string {
  const {
    source,
    programTitle,
    requireArabic,
    type,
    count,
    includeSummary,
    previousFailure,
  } = params;

  const languageRules = requireArabic
    ? `
قواعد اللغة الإلزامية:
- اكتب كل النصوص التعليمية بالعربية.
- إذا كان المصدر إنجليزيًا فترجم المعنى بأمانة إلى العربية.
- يسمح بإبقاء المصطلح التقني الإنجليزي القصير بين قوسين بعد المصطلح العربي.
- لا تُرجع سؤالًا أو شرحًا كاملًا بالإنجليزية.
`
    : `
لغة المخرجات: الإنجليزية.
`;

  const repair = previousFailure
    ? `
المحاولة السابقة رُفضت آليًا للسبب التالي:
${previousFailure}
صحح السبب بالكامل في هذه المحاولة ولا تكرر الخطأ.
`
    : "";

  const task =
    type === "MCQ"
      ? `
أنشئ بالضبط ${count} أسئلة اختيار من متعدد.
- لكل سؤال 4 خيارات نصية بالضبط.
- correctAnswer يجب أن يطابق نص أحد الخيارات حرفيًا.
`
      : `
أنشئ بالضبط ${count} سؤال صح/خطأ.
- لا ترسل options.
- correctAnswer يجب أن يكون TRUE أو FALSE فقط.
`;

  const summaryRule = includeSummary
    ? "أضف summary عربيًا مركزًا يغطي المادة كلها."
    : "لا حاجة إلى summary في هذه الدفعة.";

  return `أنت منشئ امتحان نهائي مقيد بالمصدر لبرنامج تدريبي بعنوان "${programTitle}".
استخدم حصراً النص الموجود بين SOURCE START وSOURCE END.
ممنوع استخدام المعرفة العامة أو اختراع معلومة غير موجودة في المصدر.
${languageRules}
${repair}
${task}
${summaryRule}

قواعد مشتركة:
- كل سؤال يجب أن يحتوي sourcePage حقيقية من المصدر.
- explanation يجب أن يشرح الإجابة باختصار استنادًا إلى نفس المصدر.
- لا تكرر السؤال نفسه أو نفس الفكرة بصياغة شبه مطابقة.
- لا تنشئ سؤالًا لا تدعمه المادة بوضوح.
- أعد JSON فقط بلا Markdown أو تعليق خارجي.

الشكل المطلوب:
${includeSummary
  ? '{"summary":"...","questions":[{"type":"' + type + '","text":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"...","sourcePage":1}]}'
  : '{"questions":[{"type":"' + type + '","text":"...","correctAnswer":"TRUE","explanation":"...","sourcePage":1}]}'}

SOURCE START
${source}
SOURCE END`;
}

async function requestFinalExamOpenAI(
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "OPENAI_API_KEY غير مضبوط." };
  }

  const model = process.env.OPENAI_MODEL || "gpt-6-luna";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 18000,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      error: `OpenAI (${response.status}): ${body.slice(0, 300)}`,
    };
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };

  const text =
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    "";

  if (!text.trim()) {
    return { ok: false, error: "أعاد OpenAI استجابة فارغة." };
  }

  return { ok: true, text };
}

async function requestFinalExamAnthropic(
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY غير مضبوط." };
  }

  const model =
    process.env.ANTHROPIC_FINAL_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "claude-sonnet-5-5";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 18000,
      messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return {
      ok: false,
      error: `Anthropic (${response.status}): ${body.slice(0, 300)}`,
    };
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  const text = (data.content ?? [])
    .filter((item) => item.type === "text")
    .map((item) => item.text ?? "")
    .join("");

  if (!text.trim()) {
    return { ok: false, error: "أعاد Anthropic استجابة فارغة." };
  }

  return { ok: true, text };
}

async function requestFinalExam(
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
  const attempts: Array<
    () => Promise<{ ok: true; text: string } | { ok: false; error: string }>
  > = [];

  const addOpenAI = () => {
    if (process.env.OPENAI_API_KEY) {
      attempts.push(() => requestFinalExamOpenAI(prompt));
    }
  };
  const addAnthropic = () => {
    if (process.env.ANTHROPIC_API_KEY) {
      attempts.push(() => requestFinalExamAnthropic(prompt));
    }
  };

  if (explicit === "openai") {
    addOpenAI();
    addAnthropic();
  } else if (explicit === "anthropic" || explicit === "claude") {
    addAnthropic();
    addOpenAI();
  } else {
    addOpenAI();
    addAnthropic();
  }

  if (attempts.length === 0) {
    return {
      ok: false,
      error:
        "لا يوجد مزود ذكاء اصطناعي مفعّل. اضبط OPENAI_API_KEY أو ANTHROPIC_API_KEY في Vercel.",
    };
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    const result = await attempt();
    if (result.ok) return result;
    errors.push(result.error);
  }

  return {
    ok: false,
    error: `تعذر التوليد عبر جميع المزودين: ${errors.join(" | ")}`,
  };
}

async function generateValidatedBatch(params: {
  source: string;
  programTitle: string;
  requireArabic: boolean;
  type: FinalQuestionType;
  count: number;
  includeSummary: boolean;
  validPages: Set<number>;
}): Promise<{ summary?: string; questions: FinalQuestion[] }> {
  let previousFailure: string | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const prompt = buildBatchPrompt({
      source: params.source,
      programTitle: params.programTitle,
      requireArabic: params.requireArabic,
      type: params.type,
      count: params.count,
      includeSummary: params.includeSummary,
      previousFailure,
    });

    const response = await requestFinalExam(prompt);
    if (!response.ok) throw new Error(response.error);

    try {
      const parsed = JSON.parse(extractJson(response.text)) as ParsedBatch;
      const validation = validateBatch(
        parsed,
        params.type,
        params.count,
        params.validPages,
        params.requireArabic,
        params.includeSummary,
      );

      if (!validation) {
        return {
          summary: parsed.summary,
          questions: parsed.questions ?? [],
        };
      }

      previousFailure = validation;
    } catch (error) {
      previousFailure =
        error instanceof Error
          ? error.message
          : "الاستجابة لم تكن JSON صالحًا بالشكل المطلوب.";
    }
  }

  throw new Error(
    `فشل إنشاء دفعة ${params.type} بعد ثلاث محاولات. السبب الأخير: ${previousFailure ?? "مخرجات غير صالحة"}`,
  );
}

async function generateArabicSummary(
  source: string,
  programTitle: string,
  requireArabic: boolean,
): Promise<string> {
  const languageRule = requireArabic
    ? "اكتب الملخص بالعربية حتى لو كان المصدر إنجليزيًا."
    : "Write the summary in English.";

  let previousFailure = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = `لخص المادة التدريبية بعنوان "${programTitle}" اعتمادًا حصراً على SOURCE.
${languageRule}
أعد JSON فقط بالشكل: {"summary":"..."}
يجب أن يكون الملخص مركزًا ويغطي المحاور الرئيسية دون إضافة معرفة خارجية.
${previousFailure ? `المحاولة السابقة فشلت: ${previousFailure}` : ""}

SOURCE START
${source}
SOURCE END`;

    const response = await requestFinalExam(prompt);
    if (!response.ok) throw new Error(response.error);

    try {
      const parsed = JSON.parse(extractJson(response.text)) as { summary?: string };
      const summary = parsed.summary?.trim() ?? "";
      if (summary.length < 40) {
        previousFailure = "الملخص قصير أو مفقود.";
        continue;
      }
      if (requireArabic && !isPredominantlyArabic(summary)) {
        previousFailure = "الملخص ليس بالعربية.";
        continue;
      }
      return summary;
    } catch (error) {
      previousFailure =
        error instanceof Error ? error.message : "JSON غير صالح.";
    }
  }

  throw new Error(`FINAL_SUMMARY_VALIDATION_FAILED: ${previousFailure}`);
}

export async function generateFinalQuestions(
  programId: string,
  _prev: FinalQuestionsState | null,
  _formData: FormData,
): Promise<FinalQuestionsState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "UNAUTHENTICATED" };
  }

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId: session.user.id },
    select: {
      id: true,
      title: true,
      language: true,
    },
  });

  if (!program) {
    return { ok: false, error: "PROGRAM_NOT_FOUND" };
  }

  const sourceDocument = await extractionService.selectBestRealSourceDocument(
    programId,
    session.user.id,
    false,
  );

  if (!sourceDocument.ok) {
    const candidate = await prisma.trainingDocument.findFirst({
      where: { programId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    return {
      ok: false,
      code: "SOURCE_NOT_READY",
      documentId: candidate?.id,
      error: extractionErrorToArabic(sourceDocument.errorMessage),
    };
  }

  const pages = await prisma.documentPage.findMany({
    where: {
      documentId: sourceDocument.documentId,
      extractionStatus: "COMPLETED",
    },
    orderBy: { pageNumber: "asc" },
    select: {
      pageNumber: true,
      extractedText: true,
      title: true,
      extractionMethod: true,
    },
  });

  const usable = pages.filter(
    (page) =>
      page.extractionMethod !== null &&
      page.extractionMethod !== "MOCK" &&
      (page.extractedText?.trim().length ?? 0) > 20,
  );

  if (!usable.length) {
    return {
      ok: false,
      code: "SOURCE_NOT_READY",
      documentId: sourceDocument.documentId,
      error: "المصدر مقبول لكن لا توجد صفحات نصية حقيقية قابلة للاستخدام في الامتحان النهائي.",
    };
  }

  const formatPages = (
    pageSet: typeof usable,
    charsPerPage: number,
  ) =>
    pageSet
      .map((page) => {
        const text = (page.extractedText ?? "").trim().slice(0, charsPerPage);
        return `[PAGE ${page.pageNumber}${page.title ? ` — ${page.title}` : ""}]\n${text}`;
      })
      .join("\n\n");

  // Keep the summary representative of the whole file while keeping the
  // question-generation prompts small enough for a single serverless request.
  const summarySource = formatPages(usable, 650);

  // Four disjoint page groups reduce prompt size and duplicate-question risk.
  const pageGroups = [0, 1, 2, 3].map((offset) =>
    usable.filter((_, index) => index % 4 === offset),
  );

  const requireArabic = program.language === "AR";
  const validPages = new Set(usable.map((page) => page.pageNumber));

  try {
    const [summary, mcqA, mcqB, tfA, tfB] = await Promise.all([
      generateArabicSummary(summarySource, program.title, requireArabic),
      generateValidatedBatch({
        source: formatPages(pageGroups[0], 900),
        programTitle: program.title,
        requireArabic,
        type: "MCQ",
        count: 5,
        includeSummary: false,
        validPages,
      }),
      generateValidatedBatch({
        source: formatPages(pageGroups[1], 900),
        programTitle: program.title,
        requireArabic,
        type: "MCQ",
        count: 5,
        includeSummary: false,
        validPages,
      }),
      generateValidatedBatch({
        source: formatPages(pageGroups[2], 900),
        programTitle: program.title,
        requireArabic,
        type: "TF",
        count: 10,
        includeSummary: false,
        validPages,
      }),
      generateValidatedBatch({
        source: formatPages(pageGroups[3], 900),
        programTitle: program.title,
        requireArabic,
        type: "TF",
        count: 10,
        includeSummary: false,
        validPages,
      }),
    ]);

    const questions = [
      ...mcqA.questions,
      ...mcqB.questions,
      ...tfA.questions,
      ...tfB.questions,
    ];

    if (questions.length !== 30) {
      throw new Error(`FINAL_QUESTION_TOTAL_MISMATCH: ${questions.length}`);
    }

    const normalized = new Set<string>();
    for (const [index, question] of questions.entries()) {
      const key = question.text.trim().toLocaleLowerCase("ar").replace(/\s+/g, " ");
      if (normalized.has(key)) {
        throw new Error(`FINAL_DUPLICATE_QUESTION_AT_${index + 1}`);
      }
      normalized.add(key);
    }

    return {
      ok: true,
      summary,
      questions,
      googleAppsScript: buildGoogleAppsScript(program.title, questions),
      sourceFileName: sourceDocument.fileName,
      sourcePageCount: usable.length,
    };
  } catch (error) {
    return {
      ok: false,
      code: "GENERATION_FAILED",
      error:
        error instanceof Error
          ? error.message
          : "تعذر إنشاء الأسئلة النهائية من المصدر المقبول.",
    };
  }
}

function buildGoogleAppsScript(title: string, questions: FinalQuestion[]) {
  const payload = JSON.stringify(questions).replace(/</g, "\\u003c");
  return `function createTrainingExam() {
  const form = FormApp.create(${JSON.stringify(title + " — الامتحان النهائي")});
  form.setIsQuiz(true);
  form.setDescription("تم إنشاء الأسئلة حصراً من محتوى المادة التدريبية المرفقة.");
  const questions = ${payload};
  questions.forEach(function(q, index) {
    if (q.type === "MCQ") {
      const item = form.addMultipleChoiceItem();
      item.setTitle((index + 1) + ". " + q.text);
      item.setChoices(q.options.map(function(opt) {
        return item.createChoice(opt, opt === q.correctAnswer);
      }));
      item.setPoints(1);
    } else {
      const item = form.addMultipleChoiceItem();
      item.setTitle((index + 1) + ". " + q.text);
      item.setChoices([
        item.createChoice("صح", q.correctAnswer === "TRUE"),
        item.createChoice("خطأ", q.correctAnswer === "FALSE")
      ]);
      item.setPoints(1);
    }
  });
  Logger.log("Edit URL: " + form.getEditUrl());
  Logger.log("Published URL: " + form.getPublishedUrl());
}`;
}
