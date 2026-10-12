import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sameOrigin, smallJson } from "@/lib/exam-material/http";
import { reserveResource, completeResource, manageResource, addCategory } from "@/lib/resources/service";
const schema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("reserve"), input: z.unknown() }).strict(),
  z.object({ mode: z.literal("complete"), id: z.string().uuid(), url: z.string().url().max(1000) }).strict(),
  z.object({ mode: z.literal("manage"), id: z.string().uuid(), action: z.enum(["delete", "restore", "rename"]), title: z.string().max(160).optional() }).strict(),
  z.object({ mode: z.literal("category"), programId: z.string().uuid(), name: z.string().max(160) }).strict(),
]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  const user = await auth(); if (!user?.user?.id) return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });
  try {
    const data = schema.parse(await smallJson(request)); const owner = user.user.id;
    if (data.mode === "reserve") return NextResponse.json(await reserveResource(owner, data.input));
    if (data.mode === "complete") await completeResource(data.id, owner, data.url);
    if (data.mode === "manage") await manageResource(data.id, owner, data.action, data.title);
    if (data.mode === "category") return NextResponse.json(await addCategory(owner, data.programId, data.name));
    return NextResponse.json({ ok: true });
  } catch(error) {
    const messages: Record<string, string> = { UNSUPPORTED_FILE: "اختر PDF أو DOCX أو PPTX أو XLSX أو TXT أو MP4 أو WebM.", FILE_TOO_LARGE: "الملفات حتى ٣٠ MB؛ الفيديوهات حتى ٥١٢ MB.", INVALID_CATEGORY: "القسم غير موجود في هذا البرنامج.", RESOURCE_LIMIT: "بلغ البرنامج حد ١٠٠٠ مورد.", RESOURCE_RATE_LIMIT: "الحد ٢٠ موردًا خلال ١٥ دقيقة؛ انتظر وأعد المحاولة.", CATEGORY_LIMIT: "بلغ البرنامج حد الأقسام المخصصة.", UPLOAD_EXPIRED: "انتهت مهلة الرفع؛ ابدأ محاولة جديدة.", INVALID_BLOB: "الملف المرفوع لا يطابق المورد أو حجمه ونوعه.", NOT_FOUND: "المورد غير موجود أو لا تملك صلاحية إدارته." };
    return NextResponse.json({ error: messages[error instanceof Error ? error.message : ""] ?? "تعذّر تنفيذ الطلب؛ راجع المدخلات وأعد المحاولة." }, { status: 400 });
  }
}
