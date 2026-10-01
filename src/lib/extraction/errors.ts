export function extractionErrorToArabic(message?: string): string {
  const value = message ?? "";

  if (
    value.includes("MOCK_ONLY_CONTENT") ||
    value.includes("REAL_SOURCE_REQUIRED")
  ) {
    return "المحتوى الحالي تجريبي أو مستخرج بطريقة قديمة غير موثوقة. يجب إعادة تحليل ملف PDF الحقيقي قبل توليد الأيام والأسئلة.";
  }

  if (value.includes("NO_TRAINING_DOCUMENT")) {
    return "لا يوجد ملف تدريبي مرفوع لهذا البرنامج.";
  }
  if (value.includes("REAL_SOURCE_REQUIRED")) {
    return "لم يتم العثور على مصدر حقيقي صالح بين الملفات المرفوعة. أعد تحليل أحد ملفات PDF ثم حاول مرة أخرى.";
  }
  if (value.includes("NO_REAL_EXTRACTION_ADAPTER")) {
    return "لا يوجد مزود استخراج حقيقي مفعّل. يجب ضبط OPENAI_API_KEY أو LLAMA_CLOUD_API_KEY في بيئة الإنتاج.";
  }
  if (value.includes("OPENAI_PDF_API_ERROR_401")) {
    return "تعذر التحقق من مفتاح OpenAI المستخدم لاستخراج الملف. راجع OPENAI_API_KEY في إعدادات Vercel.";
  }
  if (value.includes("OPENAI_PDF_API_ERROR_429")) {
    return "وصل مزود الذكاء الاصطناعي إلى حد الاستخدام مؤقتًا. حاول مرة أخرى بعد قليل أو راجع الرصيد وحدود الاستخدام.";
  }
  if (
    value.includes("INSUFFICIENT_REAL_EXTRACTION_COVERAGE") ||
    value.includes("OPENAI_PDF_BATCH_EXTRACTION_FAILED")
  ) {
    return "تم استخراج جزء من ملف PDF الحقيقي، لكن التغطية غير كافية لبناء 10 أيام و50 سؤالًا بصورة موثوقة. أعد المحاولة ليكمل النظام استخراج الصفحات الحقيقية المتبقية.";
  }
  if (
    value.includes("OPENAI_PDF_NO_READABLE_CONTENT") ||
    value.includes("OPENAI_PDF_PAGES_MISSING")
  ) {
    return "لم يتمكن النظام من استرجاع نص قابل للاستخدام من ملف PDF. تحقق من أن الملف غير تالف وأن صفحاته قابلة للقراءة.";
  }
  if (value.includes("OPENAI_PDF_INVALID_JSON")) {
    return "اكتمل تحليل الملف لكن صيغة نتيجة الاستخراج لم تكن صالحة. أعد المحاولة؛ لن يتم استخدام بيانات وهمية.";
  }
  if (value.includes("REAL_EXTRACTION_FAILED")) {
    return "تعذر استخراج محتوى حقيقي من ملف PDF باستخدام مزودي الاستخراج المتاحين. لم يتم إنشاء أي محتوى وهمي.";
  }

  return "تعذر استخراج المحتوى الحقيقي من الملف التدريبي. أعد المحاولة أو تحقق من إعداد مزود الاستخراج.";
}
