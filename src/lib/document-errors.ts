/** Translate known failures without exposing provider responses or credentials. */
export function documentErrorLabel(reason: string | null | undefined, fallback = "تعذّرت معالجة المستند. يمكنك إعادة المحاولة، وإذا تكرر الخطأ تواصل مع مسؤول المنصة."): string {
  const message = reason ?? "";
  if (/PROGRAM_PROCESSING/.test(message)) return "يجري توليد الأسئلة من مستند آخر لهذا البرنامج. انتظر اكتماله قبل بدء محاولة أخرى.";
  if (/EXTRACTION_REQUIRED/.test(message)) return "اقبل المستند واستخرج نصه أولاً، ثم ابدأ توليد الأسئلة.";
  if (/SESSION_EXPIRED|UNAUTHORIZED/.test(message)) return "انتهت جلسة تسجيل الدخول. سجّل الدخول مجدداً لمتابعة المستند.";
  if (/OCR_REQUIRED|MOCK_ONLY_CONTENT/.test(message)) return "يحتاج المستند إلى قراءة الصور. فعّل خدمة قراءة المستندات ثم أعد المحاولة، أو ارفع نسخة PDF تحتوي على نص قابل للتحديد.";
  if (/NO_ADAPTER_AVAILABLE/.test(message)) return "لم تتوفر معالجة مناسبة للمستند في المحاولة السابقة. أعد المعالجة لاستخراج النص من الملف المحفوظ.";
  if (/ANTHROPIC_API_KEY/.test(message)) return "خدمة توليد الأسئلة غير مهيأة. تواصل مع مسؤول المنصة ثم أعد المحاولة.";
  if (/PDF_PASSWORD_REQUIRED|PasswordException/.test(message)) return "المستند محمي بكلمة مرور. ارفع نسخة غير محمية.";
  if (/INVALID_PDF|InvalidPDFException/.test(message)) return "تعذّرت قراءة ملف PDF. جرّب تصديره من المصدر ورفعه مجدداً.";
  if (/CONTENT_ALREADY_EXISTS/.test(message)) return "يحتوي البرنامج على أسئلة أو جلسات محفوظة. استخدم إدارة المحتوى لمراجعتها، أو أنشئ برنامجاً جديداً لهذا المستند.";
  if (/^AI_.*:PLAN$/.test(message)) return "لم تكتمل خطة الأيام العشرة بعد محاولة التصحيح. بقي المستند مقبولاً؛ أعد توليد الأسئلة.";
  const dayFailure = message.match(/^AI_.*:DAY_(\d+)$/);
  if (dayFailure) return `لم تجتز أسئلة اليوم ${dayFailure[1]} التحقق بعد محاولة التصحيح. بقي المستند مقبولاً؛ أعد توليد الأسئلة.`;
  if (/AI_INCOMPLETE_CONTENT|AI_INVALID_CONTENT|AI_INVALID_DAY_PLAN|AI_INVALID_SOURCE_PAGE|AI_OUTPUT_TRUNCATED|AI_OUTPUT_REFUSED|Expected 10 days|AI_LANGUAGE_MISMATCH/.test(message)) return "لم تُرجع خدمة التوليد أسئلة مكتملة وصالحة. حُفظ المحتوى الموجود ويمكنك إعادة المحاولة.";
  if (/BLOB_READ|ENOENT|not found.*blob/i.test(message)) return "تعذّر الوصول إلى الملف المحفوظ. تحقق من إعدادات التخزين أو ارفع المستند مجدداً.";
  if (/401|403|authentication|invalid.*api.*key/i.test(message)) return "رفضت خدمة المعالجة طلب الاتصال. على مسؤول المنصة التحقق من صلاحية إعدادات الخدمة.";
  if (/429|quota|credit|billing|rate.limit/i.test(message)) return "بلغت خدمة المعالجة حد الاستخدام أو الرصيد المتاح. تحقق من الاشتراك ثم أعد المحاولة لاحقاً.";
  if (/timeout|timed out|TIMEOUT|aborted/i.test(message)) return "انتهت مهلة المعالجة. حاول لاحقاً أو قسّم المستند إلى أجزاء أصغر.";
  if (/NO_EXTRACTED_PAGES|EXTRACTION_INCOMPLETE/.test(message)) return "لم يكتمل استخراج نص المستند. أعد المحاولة أو ارفع نسخة أوضح.";
  return fallback;
}
