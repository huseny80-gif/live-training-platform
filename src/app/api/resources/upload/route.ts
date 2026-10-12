import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
import { sameOrigin } from "@/lib/exam-material/http";
import { resourceForOwner } from "@/lib/resources/service";
export async function POST(request: Request) {
  if (process.env.BLOB_READ_WRITE_TOKEN || !sameOrigin(request)) return NextResponse.json({ error: "استخدم مسار الرفع المصرّح به." }, { status: 403 });
  const user = await auth(); if (!user?.user?.id) return NextResponse.json({ error: "سجّل الدخول أولاً." }, { status: 401 });
  try {
    const form = await request.formData(); const id = form.get("id"); const bytes = form.get("file");
    if (typeof id !== "string" || !(bytes instanceof File)) throw new Error("INVALID_FILE");
    const resource = await resourceForOwner(id, user.user.id);
    if (resource.status !== "PENDING" || resource.archivedAt || bytes.size !== resource.sizeBytes || resource.createdAt.getTime() < Date.now() - 60 * 60_000) throw new Error("INVALID_FILE");
    await storage.save(resource.blobPath, Buffer.from(await bytes.arrayBuffer()), resource.mimeType);
    await prisma.resourceFile.updateMany({ where: { id, status: "PENDING", program: { instructorId: user.user.id } }, data: { status: "READY", storagePath: resource.blobPath } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "تعذّر حفظ الملف؛ تحقق من حجمه وصلاحياته." }, { status: 400 }); }
}
