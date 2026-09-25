// Versioned prompt templates — bump PROMPT_VERSION when changing prompts
// so aiPromptVersion on Question tracks which prompt produced each question.

export const PROMPT_VERSION = "v1.0";

export function buildDayPlanPrompt(
  pages: Array<{ pageNumber: number; title?: string | null; extractedText: string }>,
  programTitle: string,
  language: "AR" | "EN",
  totalDays: number
): string {
  const pageList = pages
    .map((p) => `[صفحة ${p.pageNumber}${p.title ? ` — ${p.title}` : ""}]\n${p.extractedText.slice(0, 800)}`)
    .join("\n\n---\n\n");

  return `أنت مصمم محتوى تعليمي محترف. مهمتك تحليل محتوى تدريبي مستخرج من ملف PDF وتقسيمه إلى ${totalDays} أيام تدريبية متوازنة.

البرنامج: "${programTitle}"
اللغة المطلوبة للمخرجات: ${language === "AR" ? "العربية" : "الإنجليزية"}
عدد الصفحات: ${pages.length}
عدد الأيام: ${totalDays}

المحتوى المستخرج:
${pageList}

المطلوب: أنشئ خطة ${totalDays} أيام. أعد JSON صارم بالشكل التالي فقط، بدون أي نص خارجه:

{
  "days": [
    {
      "dayNumber": 1,
      "title": "عنوان اليوم",
      "objectives": ["هدف 1", "هدف 2", "هدف 3"],
      "contentSummary": "ملخص محتوى اليوم",
      "topics": ["موضوع 1", "موضوع 2"],
      "pageRangeStart": 1,
      "pageRangeEnd": 15,
      "sourcePages": [1, 2, 3, 4, 5]
    }
  ]
}

قواعد صارمة:
- أعد JSON فقط، لا شرح ولا تعليق
- يجب أن تغطي الأيام جميع الصفحات المتاحة بالتساوي تقريباً
- كل يوم يجب أن يحتوي على 2-4 أهداف
- كل يوم يجب أن يحتوي على موضوعين على الأقل
- الأرقام يجب أن تكون صحيحة (integers)`;
}

export function buildQuestionsPrompt(
  dayPlan: { dayNumber: number; title: string; topics: string[]; contentSummary: string; sourcePages: number[] },
  pages: Array<{ pageNumber: number; title?: string | null; extractedText: string }>,
  language: "AR" | "EN",
  questionsPerDay: number,
  existingQuestionTexts: string[] = []
): string {
  const dayPages = pages.filter((p) => dayPlan.sourcePages.includes(p.pageNumber));
  const pageContent = dayPages
    .map((p) => `[صفحة ${p.pageNumber}${p.title ? ` — ${p.title}` : ""}]\n${p.extractedText.slice(0, 1000)}`)
    .join("\n\n---\n\n");

  const avoidBlock = existingQuestionTexts.length > 0
    ? `\nتجنب التكرار مع هذه الأسئلة الموجودة:\n${existingQuestionTexts.map((q, i) => `${i + 1}. ${q}`).join("\n")}\n`
    : "";

  return `أنت خبير في إنشاء أسئلة اختيار متعدد تعليمية. مهمتك إنشاء ${questionsPerDay} أسئلة دقيقة لليوم التدريبي المحدد.

اليوم: ${dayPlan.dayNumber} — "${dayPlan.title}"
المواضيع: ${dayPlan.topics.join("، ")}
اللغة: ${language === "AR" ? "العربية" : "الإنجليزية"}
${avoidBlock}
محتوى الصفحات:
${pageContent || "محتوى غير متوفر — استخدم موضوع اليوم كمرجع"}

المطلوب: أنشئ ${questionsPerDay} أسئلة. أعد JSON صارم فقط:

{
  "questions": [
    {
      "questionText": "نص السؤال؟",
      "options": [
        {"label": "A", "text": "الخيار أ"},
        {"label": "B", "text": "الخيار ب"},
        {"label": "C", "text": "الخيار ج"},
        {"label": "D", "text": "الخيار د"}
      ],
      "correctLabel": "A",
      "explanation": "شرح مختصر للإجابة الصحيحة",
      "questionOrder": 1,
      "sourcePageNumber": 3,
      "topic": "الموضوع المرتبط",
      "difficulty": "MEDIUM"
    }
  ]
}

قواعد صارمة:
- أعد JSON فقط، لا شرح ولا تعليق
- كل سؤال يجب أن يحتوي على 4 خيارات (A, B, C, D)
- إجابة صحيحة واحدة فقط لكل سؤال
- correctLabel يجب أن يكون A أو B أو C أو D
- questionOrder يبدأ من 1 حتى ${questionsPerDay}
- sourcePageNumber يجب أن يكون من الصفحات: [${dayPlan.sourcePages.join(", ")}]
- difficulty يجب أن يكون EASY أو MEDIUM أو HARD
- الأسئلة يجب أن تقيس الفهم الحقيقي وليس الحفظ فقط
- لا تكرر نفس المعنى في سؤالين مختلفين`;
}
