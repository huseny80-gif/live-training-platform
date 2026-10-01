// Presentation labels only; database enums and API error codes stay unchanged.
const statusLabels: Record<string, string> = {
  DRAFT: "مسودة", ACTIVE: "نشط", ARCHIVED: "مؤرشف", PAUSED: "موقوف مؤقتاً",
  ENDED: "منتهي", APPROVED: "معتمد", READY: "جاهز", LIVE: "مباشر",
  CLOSED: "مغلق", RESULTS: "نتائج", PENDING: "قيد الانتظار",
  PROCESSING: "جاري المعالجة", COMPLETED: "مكتمل", FAILED: "تعذّرت المعالجة",
  OCR_REQUIRED: "يتطلب استخراج النص", REVIEWED: "تمت المراجعة", REJECTED: "مرفوض",
};
export function statusLabel(status: string): string {
  return statusLabels[status] ?? "قيد المراجعة";
}

const errors: Record<string, string> = {
  INVALID_TOKEN: "انتهت صلاحية الدخول. انضم إلى الجلسة مجدداً.",
  PARTICIPANT_NOT_IN_SESSION: "يرجى الانضمام إلى هذه الجلسة أولاً.",
  QUESTION_NOT_LIVE: "أُغلق هذا السؤال. انتظر السؤال التالي.",
  QUESTION_NOT_FOUND: "السؤال غير متاح حالياً.",
  INVALID_OPTION: "هذا الخيار غير متاح. حاول مجدداً.",
  UNAUTHENTICATED: "يرجى تسجيل الدخول مجدداً.",
  FORBIDDEN: "ليس لديك صلاحية لهذا الإجراء.",
  NO_ADAPTER_AVAILABLE: "استخراج المستندات غير متاح حالياً. تواصل مع مسؤول المنصة.",
};
export function errorLabel(error: string): string {
  return errors[error] ?? "تعذّر إكمال العملية. تحقق من البيانات وحاول مجدداً.";
}
