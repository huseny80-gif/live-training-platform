import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sameOrigin } from "@/lib/exam-material/http";
import { checkRateLimit } from "@/lib/rate-limit";
import { saveVideo, archiveVideo } from "@/lib/exam-material/videos";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  const user = await auth();
  if (!user?.user?.id) return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });
  if (!checkRateLimit(`video:${user.user.id}`).allowed) return NextResponse.json({ error: "تجاوزت حد المحاولات؛ انتظر ثم أعد المحاولة." }, { status: 429 });
  try {
    const text = await request.text(); if (text.length > 250_000) throw new Error("BODY_TOO_LARGE");
    const raw = JSON.parse(text);
    if (raw.mode === "archive") {
      const data = z.object({ mode: z.literal("archive"), id: z.string().uuid(), archived: z.boolean() }).strict().parse(raw);
      await archiveVideo(user.user.id, data.id, data.archived); return NextResponse.json({ ok: true });
    }
    const { id } = await saveVideo(user.user.id, raw);
    return NextResponse.json({ id });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const messages: Record<string, string> = {
      INVALID_TRANSCRIPT: "استخدم SRT أو VTT بنص عادي ومقاطع زمنية مرتبة دون تداخل أو وسوم؛ راجعه مقابل الفيديو قبل الحفظ.",
      INVALID_VIDEO_URL: "أدخل رابط HTTPS مباشرًا لفيديو YouTube أو Vimeo، أو اترك الرابط فارغًا.",
      VIDEO_LIMIT: "بلغ البرنامج الحد الأقصى: ١٠٠ فيديو.",
    };
    return NextResponse.json({ error: messages[code] ?? "تعذّر الحفظ؛ تحقق من البيانات والصلاحيات وتأكيد مراجعة النص." }, { status: 400 });
  }
}
