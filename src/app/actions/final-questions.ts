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
  | { ok: false; error: string }
  | {
      ok: true;
      summary: string;
      questions: FinalQuestion[];
      googleAppsScript: string;
      sourceFileName: string;
      sourcePageCount: number;
    };

type ParsedFinalExam = {
  summary: string;
  questions: FinalQuestion[];
};

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("INVALID_JSON");
  return raw.slice(start, end + 1);
}

function validateFinalExam(
  parsed: ParsedFinalExam,
  validPages: Set<number>,
  requireArabic: boolean,
): string | null {
  if (!parsed || typeof parsed.summary !== "string" || !Array.isArray(parsed.questions)) {
    return "بنية الاستجابة غير صحيحة.";
  }

  const mcq = parsed.questions.filter((q) => q.type === "MCQ");
  const tf = parsed.questions.filter((q) => q.type === "TF");

  if (mcq.length !== 10 || tf.length !== 20 || parsed.questions.length !== 30) {
    return `يجب أن تكون النتيجة 10 أسئلة اختيار من متعدد و20 سؤال صح/خطأ بالضبط. الناتج الحالي: ${mcq.length} MCQ و${tf.length} T/F.`;
  }

  for (const [index, question] of parsed.questions.entries()) {
    if (!question || typeof question.text !== "string" || question.text.trim().length < 5) {
      return `السؤال رقم ${index + 1} لا يحتوي نصًا صالحًا.`;
    }
    if (typeof question.explanation !== "string" || question.explanation.trim().length < 3) {
      return `السؤال رقم ${index + 1} لا يحتوي شرحًا صالحًا.`;
    }
    if (!Number.isInteger(question.sourcePage) || !validPages.has(question.sourcePage)) {
      return `السؤال رقم ${index + 1} يشير إلى صفحة مصدر غير صالحة.`;
    }

    if (question.type === "MCQ") {
      if (!Array.isArray(question.options) || question.options.length !== 4) {
        return `السؤال رقم ${index + 1} يجب أن يحتوي أربعة خيارات.`;
      }
      if (question.options.some((option) => typeof option !== "string" || option.trim().length === 0)) {
        return `السؤال رقم ${index + 1} يحتوي خيارًا فارغًا.`;
      }
      if (!question.options.includes(question.correctAnswer)) {
        return `الإجابة الصحيحة في السؤال رقم ${index + 1} ليست واحدة من الخيارات الأربعة.`;
      }
    } else if (question.type === "TF") {
      if (question.correctAnswer !== "TRUE" && question.correctAnswer !== "FALSE") {
        return `السؤال رقم ${index + 1} من نوع صح/خطأ يجب أن تكون إجابته TRUE أو FALSE.`;
      }
    } else {
      return `نوع السؤال رقم ${index + 1} غير مدعوم.`;
    }

    if (requireArabic) {
      if (!isPredominantlyArabic(question.text) || !isPredominantlyArabic(question.explanation)) {
        return `السؤال رقم ${index + 1} أو شرحه ليس بالعربية.`;
      }
      if (
        question.type === "MCQ" &&
        !isArabicQuestionContent(
          question.text,
          (question.options ?? []).map((text) => ({ text })),
        )
      ) {
        return `خيارات السؤال رقم ${index + 1} لا تطابق متطلبات اللغة العربية.`;
      }
    }
  }

  if (requireArabic && !isPredominantlyArabic(parsed.summary)) {
    return "ملخص المادة ليس بالعربية.";
  }

  return null;
}

function buildPrompt(
  source: string,
  programTitle: string,
  requireArabic: boolean,
  previousFailure?: string,
): string {
  const languageRules = requireArabic
    ? `
قواعد اللغة الإلزامية:
- اكتب الملخص بالعربية.
- اكتب نص كل سؤال بالعربية.
- اكتب جميع خيارات MCQ بالعربية؛ يسمح بالمصطلح التقني الإنجليزي القصير بين قوسين عند الحاجة فقط.
- اكتب شرح كل إجابة بالعربية.
- لا تحول السؤال إلى الإنجليزية حتى لو كان المصدر إنجليزيًا؛ ترجم المعنى بأمانة مع إبقاء المصطلح التقني بين قوسين عند الحاجة.
`
    : `
لغة المخرجات: الإنجليزية.
`;

  const repair = previousFailure
    ? `
المحاولة السابقة رُفضت آليًا للسبب التالي:
${previousFailure}
صحح هذا السبب بالكامل في هذه المحاولة ولا تكرر الخطأ.
`
    : "";

  return `أنت منشئ امتحان نهائي مقيد بالمصدر لبرنامج تدريبي بعنوان "${programTitle}".
استخدم حصراً النص الموجود بين SOURCE START وSOURCE END.
ممنوع استخدام المعرفة العامة أو اختراع معلومة غير موجودة في المصدر.
${languageRules}
${repair}
المطلوب:
1) summary: ملخص مركز يغطي المادة.
2) exactly 10 MCQ، لكل سؤال 4 خيارات وإجابة واحدة صحيحة.
3) exactly 20 TRUE/FALSE.
4) كل سؤال يجب أن يحتوي sourcePage حقيقية من المصدر وشرحًا موجزًا مستندًا إليها.
5) correctAnswer في MCQ يجب أن يطابق نص أحد الخيارات حرفيًا.
6) correctAnswer في TRUE/FALSE يجب أن يكون TRUE أو FALSE فقط.
7) إذا لم يدعم المصدر حقيقة السؤال بوضوح فلا تنشئ ذلك السؤال.
8) لا تنسخ الأسئلة اليومية حرفيًا؛ أنشئ تقييمًا شاملاً للمادة.
9) أعد JSON فقط، بلا Markdown ولا شرح خارجي.

الشكل المطلوب:
{"summary":"...","questions":[{"type":"MCQ","text":"...","options":["...","...","...","..."],"correctAnswer":"النص الصحيح حرفياً","explanation":"...","sourcePage":1},{"type":"TF","text":"...","correctAnswer":"TRUE","explanation":"...","sourcePage":2}]}

SOURCE START
${source}
SOURCE END`;
}

async function requestFinalExam(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: 24000,
    }),
  });

  if (!response.ok) {
    return {
      ok: false,
      error: `تعذر إنشاء الأسئلة النهائية عبر OpenAI (${response.status}).`,
    };
  }

  const data = await response.json() as {
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
    return { ok: false, error: "أعاد نموذج الذكاء الاصطناعي استجابة فارغة." };
  }

  return { ok: true, text };
}

export async function generateFinalQuestions(
  programId: string,
  _prev: FinalQuestionsState | null,
  _formData: FormData,
): Promise<FinalQuestionsState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" };

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId: session.user.id },
    select: {
      id: true,
      title: true,
      language: true,
    },
  });

  if (!program) return { ok: false, error: "PROGRAM_NOT_FOUND" };

  const sourceDocument = await extractionService.selectBestRealSourceDocument(
    programId,
    session.user.id,
    false
  );

  if (!sourceDocument.ok) {
    return {
      ok: false,
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
      (page.extractedText?.trim().length ?? 0) > 20
  );

  if (!usable.length) {
    return {
      ok: false,
      error: "لا توجد صفحات حقيقية مستخرجة من الملف. أعد تحليل المادة ثم حاول إنشاء الأسئلة النهائية.",
    };
  }

  // Keep all usable page references while bounding each page contribution so
  // a large 147-page source remains inside a reliable model context window.
  const source = usable
    .map((page) => {
      const text = (page.extractedText ?? "").trim().slice(0, 1200);
      return `[PAGE ${page.pageNumber}${page.title ? ` — ${page.title}` : ""}]\n${text}`;
    })
    .join("\n\n");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY غير مضبوط." };

  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const requireArabic = program.language === "AR";
  const validPages = new Set(usable.map((page) => page.pageNumber));

  let previousFailure: string | undefined;

  // Two automatic attempts: the second one is a repair attempt driven by the
  // exact validation failure from the first response.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = buildPrompt(source, program.title, requireArabic, previousFailure);
    const response = await requestFinalExam(apiKey, model, prompt);

    if (!response.ok) {
      return { ok: false, error: response.error };
    }

    try {
      const parsed = JSON.parse(extractJson(response.text)) as ParsedFinalExam;
      const validationError = validateFinalExam(parsed, validPages, requireArabic);

      if (!validationError) {
        return {
          ok: true,
          summary: parsed.summary,
          questions: parsed.questions,
          googleAppsScript: buildGoogleAppsScript(program.title, parsed.questions),
          sourceFileName: sourceDocument.fileName,
          sourcePageCount: usable.length,
        };
      }

      previousFailure = validationError;
    } catch {
      previousFailure = "الاستجابة لم تكن JSON صالحًا بالشكل المطلوب.";
    }
  }

  return {
    ok: false,
    error:
      `تمت محاولتان تلقائيتان لإنشاء الامتحان النهائي، لكن التحقق الصارم لم ينجح. السبب الأخير: ${previousFailure ?? "مخرجات غير صالحة"}`,
  };
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
