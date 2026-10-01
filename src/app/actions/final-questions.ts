"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  | { ok: true; summary: string; questions: FinalQuestion[]; googleAppsScript: string };

export async function generateFinalQuestions(
  programId: string,
  _prev: FinalQuestionsState | null,
  _formData: FormData
): Promise<FinalQuestionsState> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "UNAUTHENTICATED" };

  const program = await prisma.trainingProgram.findFirst({
    where: { id: programId, instructorId: session.user.id },
    include: { documents: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!program) return { ok: false, error: "PROGRAM_NOT_FOUND" };
  const doc = program.documents[0];
  if (!doc) return { ok: false, error: "ارفع ملف المادة أولاً." };

  const pages = await prisma.documentPage.findMany({
    where: { documentId: doc.id, extractionStatus: "COMPLETED" },
    orderBy: { pageNumber: "asc" },
    select: { pageNumber: true, extractedText: true, title: true },
  });
  const usable = pages.filter(p => (p.extractedText?.trim().length ?? 0) > 20);
  if (!usable.length) return { ok: false, error: "يجب إكمال استخراج محتوى الملف قبل إنشاء الأسئلة النهائية." };

  const source = usable.map(p => `[PAGE ${p.pageNumber}${p.title ? ` — ${p.title}` : ""}]\n${p.extractedText}`).join("\n\n");
  const prompt = `أنت منشئ امتحان مقيد بالمصدر. استخدم حصراً النص الموجود بين SOURCE START وSOURCE END. ممنوع استخدام المعرفة العامة أو اختراع معلومة غير موجودة في المصدر.

المطلوب:
1) summary: ملخص عربي مركز يغطي المادة.
2) exactly 10 MCQ، لكل سؤال 4 خيارات وإجابة واحدة صحيحة.
3) exactly 20 TRUE/FALSE.
4) كل سؤال يجب أن يحتوي sourcePage حقيقية من المصدر وشرحاً موجزاً مستنداً إليه.
5) إذا لم يدعم المصدر حقيقة السؤال بوضوح فلا تنشئ ذلك السؤال.
6) لا تنسخ الأسئلة اليومية؛ أنشئ تقييماً شاملاً للمادة.
أعد JSON فقط:
{"summary":"...","questions":[{"type":"MCQ","text":"...","options":["...","...","...","..."],"correctAnswer":"النص الصحيح حرفياً","explanation":"...","sourcePage":1},{"type":"TF","text":"...","correctAnswer":"TRUE","explanation":"...","sourcePage":2}]}
SOURCE START
${source}
SOURCE END`;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENAI_API_KEY غير مضبوط." };
  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: prompt }),
  });
  if (!response.ok) return { ok: false, error: `تعذر إنشاء الأسئلة النهائية عبر OpenAI (${response.status}).` };
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const text = data.output_text ?? data.output?.flatMap(o => o.content ?? []).filter(x => x.type === "output_text").map(x => x.text ?? "").join("") ?? "";
  try {
    const raw = text.replace(/^```(?:json)?\s*/,"").replace(/\s*```$/,"");
    const parsed = JSON.parse(raw) as { summary: string; questions: FinalQuestion[] };
    const mcq = parsed.questions.filter(q => q.type === "MCQ");
    const tf = parsed.questions.filter(q => q.type === "TF");
    if (mcq.length !== 10 || tf.length !== 20) return { ok: false, error: `فشل التحقق: تم إنشاء ${mcq.length} MCQ و${tf.length} T/F بدلاً من 10 و20. أعد المحاولة.` };
    const validPages = new Set(usable.map(p => p.pageNumber));
    if (parsed.questions.some(q => !validPages.has(q.sourcePage))) return { ok: false, error: "فشل التحقق من مراجع الصفحات. لم يتم اعتماد الأسئلة." };
    return { ok: true, summary: parsed.summary, questions: parsed.questions, googleAppsScript: buildGoogleAppsScript(program.title, parsed.questions) };
  } catch {
    return { ok: false, error: "تعذر التحقق من مخرجات الذكاء الاصطناعي. لم يتم اعتماد أي أسئلة." };
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
