import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { publicMaterial, publishedMaterial, submitMaterial } from "@/lib/exam-material/service";
import { sha } from "@/lib/exam-material/grounding";
import { sameOrigin, smallJson } from "@/lib/exam-material/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("start") }).strict(),
  z.object({ mode: z.literal("submit"), answers: z.record(z.string().max(10), z.number().int().min(0).max(3)) }).strict(),
]);
const cookieName = (id: string) => `exam_attempt_${id}`;
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const material = await publicMaterial(token);
  if (!material) return NextResponse.json({ error: "المادة غير متاحة." }, { status: 404 });
  const secret = (await cookies()).get(cookieName(material.id))?.value;
  const attempt = secret ? await prisma.examMaterialAttempt.findFirst({ where: { batchId: material.id, tokenHash: sha(secret), createdAt: { gt: new Date(Date.now() - 12 * 60 * 60_000) } }, select: { report: true } }) : null;
  return NextResponse.json({ ...material, report: attempt?.report ?? null, hasAttempt: Boolean(attempt) }, { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "طلب غير مسموح." }, { status: 403 });
  const { token } = await params;
  try {
    const data = input.parse(await smallJson(request));
    const batch = await publishedMaterial(token);
    if (!batch) return NextResponse.json({ error: "المادة غير متاحة أو أُلغي نشرها." }, { status: 404 });
    const jar = await cookies();
    if (data.mode === "start") {
      // On Vercel this trusted header is set by the platform; local requests share one bucket.
      const address = request.headers.get("x-vercel-forwarded-for") ?? "local";
      if (!checkRateLimit(`study:${batch.id}:${address}`).allowed) return NextResponse.json({ error: "انتظر 15 دقيقة قبل بدء محاولة أخرى." }, { status: 429 });
      const secret = randomBytes(32).toString("hex");
      await prisma.examMaterialAttempt.create({ data: { batchId: batch.id, tokenHash: sha(secret) } });
      jar.set(cookieName(batch.id), secret, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: `/api/study/${token}`, maxAge: 12 * 60 * 60 });
      return NextResponse.json({ ok: true });
    }
    const secret = jar.get(cookieName(batch.id))?.value;
    if (!secret) return NextResponse.json({ error: "ابدأ محاولة جديدة أولاً." }, { status: 401 });
    const report = await submitMaterial(token, sha(secret), data.answers);
    return NextResponse.json({ report }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "تعذّر حفظ الإجابات. أجب عن جميع الأسئلة وأعد المحاولة." }, { status: 400 });
  }
}
