import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { storage } from "@/lib/storage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const user = await auth();
  if (!user?.user?.id) return new Response(null, { status: 401 });
  const { documentId } = await params;
  const document = await prisma.trainingDocument.findFirst({ where: { id: documentId, program: { instructorId: user.user.id } }, select: { storagePath: true, fileName: true } });
  if (!document) return new Response(null, { status: 404 });
  const bytes = await storage.read(document.storagePath);
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset >= bytes.length) { controller.close(); return; }
    const end = Math.min(offset + 65536, bytes.length); controller.enqueue(new Uint8Array(bytes.subarray(offset, end))); offset = end;
  } });
  return new Response(stream, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
