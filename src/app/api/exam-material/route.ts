import { after, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { publishMaterial, recoverMaterialJobs, reserveMaterial, runMaterialJob } from "@/lib/exam-material/service";
import { materialError } from "@/lib/exam-material/messages";
import { sameOrigin, smallJson } from "@/lib/exam-material/http";

export const runtime = "nodejs";
export const maxDuration = 180;
const input = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("generate"), programId: z.string().uuid(), documentIds: z.array(z.string().uuid()).min(1).max(10), count: z.number().int().min(5).max(15) }).strict(),
  z.object({ mode: z.literal("publish"), id: z.string().uuid(), publish: z.boolean() }).strict(),
]);
export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  const user = await auth();
  if (!user?.user?.id) return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });
  try {
    const data = input.parse(await smallJson(request));
    if (data.mode === "publish") {
      await publishMaterial(data.id, user.user.id, data.publish);
      return NextResponse.json({ ok: true });
    }
    if (new Set(data.documentIds).size !== data.documentIds.length || data.documentIds.length > data.count) throw new Error("INVALID_LECTURES");
    if (!checkRateLimit(`material:${user.user.id}`).allowed) return NextResponse.json({ error: "تجاوزت حد المحاولات. انتظر 15 دقيقة." }, { status: 429 });
    await recoverMaterialJobs(user.user.id);
    const batch = await reserveMaterial(user.user.id, data.programId, data.documentIds, data.count);
    after(() => runMaterialJob(batch.id, data.count));
    return NextResponse.json({ id: batch.id }, { status: 202 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: materialError[code] ?? "تعذّر تنفيذ الطلب. تحقق من المدخلات والصلاحيات وأعد المحاولة." }, { status: 400 });
  }
}
