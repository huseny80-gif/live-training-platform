import { z } from "zod";
export function resourceErrorCode(error: unknown) {
  if (error instanceof z.ZodError) {
    const issue = error.issues[0];
    if (issue?.path.includes("sizeBytes")) return issue.code === "too_small" ? "EMPTY_FILE" : "FILE_TOO_LARGE";
    if (issue?.path.includes("fileName")) return "INVALID_FILENAME";
    if (issue?.path.includes("title") || issue?.path.includes("name")) return "INVALID_TITLE";
    if (issue?.path.includes("programId")) return "INVALID_PROGRAM";
    return "INVALID_INPUT";
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (["P2028", "P1001", "P1002", "P2024"].includes(code)) return "RESOURCE_DB_TIMEOUT";
    if (code === "P2034") return "RESOURCE_CONFLICT";
  }
  if (error && typeof error === "object" && /^Blob\w*Error$/.test(error.constructor?.name ?? "")) return "RESOURCE_STORAGE_ERROR";
  return error instanceof Error && /^[A-Z_]{3,60}$/.test(error.message) ? error.message : "RESOURCE_FAILED";
}
export const resourceErrors: Record<string, string> = {
  EMPTY_FILE: "الملف فارغ؛ اختر ملفًا يحتوي على بيانات.",
  FILE_TOO_LARGE: "حجم الملف يتجاوز الحد: الفيديو حتى ٥ GB، وبقية الملفات حتى ٣٠ MB.",
  INVALID_FILENAME: "اسم الملف طويل أو يحتوي على رموز غير مقبولة؛ أعد تسميته مع الحفاظ على الامتداد.",
  INVALID_TITLE: "اكتب عنوانًا من ٣ إلى ١٦٠ حرفًا.",
  INVALID_PROGRAM: "اختر البرنامج المستهدف قبل إضافة المورد.",
  INVALID_INPUT: "تحقق من عنوان المورد والبرنامج والقسم والملف المحدد.",
  RESOURCE_DB_TIMEOUT: "استغرق حفظ المورد وقتًا طويلًا. أعد المحاولة؛ لم يُحذف ملفك المحلي.",
  RESOURCE_CONFLICT: "تزامنت عمليتا حفظ. انتظر قليلًا ثم أعد المحاولة.",
  RESOURCE_STORAGE_ERROR: "تعذّر التحقق من الملف في التخزين. أعد حفظ الملف المرفوع من هذه النافذة.",
};
