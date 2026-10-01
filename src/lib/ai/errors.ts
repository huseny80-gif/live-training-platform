export function generationErrorToArabic(message?: string): string {
  const value = message ?? "";

  if (value.includes("OPENAI_API_ERROR_401")) {
    return "تعذر التحقق من مفتاح OpenAI. راجع OPENAI_API_KEY في إعدادات Vercel.";
  }
  if (value.includes("OPENAI_API_ERROR_429")) {
    return "وصل OpenAI إلى حد الاستخدام مؤقتًا. أعد المحاولة بعد قليل أو راجع الرصيد وحدود الاستخدام.";
  }
  if (value.includes("OPENAI_EMPTY_RESPONSE")) {
    return "أعاد نموذج الذكاء الاصطناعي استجابة فارغة. أعد المحاولة؛ لم يتم استبدال المحتوى الحالي.";
  }
  if (value.includes("AI_PROVIDERS_FAILED")) {
    return "تعذر التوليد عبر مزود الذكاء الاصطناعي الأساسي والاحتياطي. لم يتم حفظ أي بنك أسئلة ناقص، ويمكن إعادة المحاولة بعد مراجعة مفاتيح المزودين.";
  }
  if (value.includes("AI_DAY_PLAN_VALIDATION_FAILED")) {
    return "لم يجتز تقسيم المادة إلى 10 أيام التحقق الصارم بعد محاولات الإصلاح. أعد المحاولة؛ سيبقى المحتوى الحالي محفوظًا.";
  }

  const dayMatch = value.match(/AI_QUESTIONS_VALIDATION_FAILED_DAY_(\d+)/);
  if (dayMatch) {
    return (
      "تعذر إنشاء خمسة أسئلة عربية صالحة لليوم " +
      dayMatch[1] +
      " بعد محاولات الإصلاح. أعد المحاولة؛ لم يتم حفظ بنك أسئلة ناقص."
    );
  }

  if (
    value.includes("AI_QUESTION_TOTAL_MISMATCH") ||
    value.includes("PERSISTED_QUESTION_TOTAL_MISMATCH") ||
    value.includes("PERSISTENCE_QUOTA_MISMATCH")
  ) {
    return "لم يكتمل العدد المطلوب 50 سؤالًا (5 لكل يوم). أُلغي الحفظ بالكامل حتى لا يظهر بنك أسئلة ناقص.";
  }

  if (
    value.includes("SOURCE_PAGE_NOT_FOUND") ||
    value.includes("NO_EXTRACTED_PAGES") ||
    value.includes("REAL_SOURCE_REQUIRED")
  ) {
    return "مصدر الصفحات الحقيقي غير مكتمل. أكمل تحليل ملف PDF ثم أعد توليد المحتوى.";
  }

  if (value.includes("EXISTING_SESSIONS") || value.includes("foreign key")) {
    return "توجد جلسات محفوظة مرتبطة ببنك الأسئلة الحالي. احذف الجلسات من تبويب الجلسات ثم أعد المحاولة.";
  }

  return "تعذر إكمال توليد الأيام والأسئلة من المصدر الحقيقي. لم يتم استبدال المحتوى الحالي، ويمكن إعادة المحاولة بأمان.";
}
