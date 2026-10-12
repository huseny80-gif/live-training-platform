import { publishedMaterial } from "@/lib/exam-material/service";
import type { SourcePage } from "@/lib/exam-material/grounding";
import { libraryVideoId } from "@/lib/exam-material/library-video";
import { prisma } from "@/lib/prisma";
import { serveResourceFile } from "@/lib/resources/serve-file";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ token: string; resourceId: string }> }) {
  const { token, resourceId } = await params;
  if (!z.string().uuid().safeParse(resourceId).success) return new Response(null, { status: 404 });
  try {
    const batch = await publishedMaterial(token);
    if (!batch || !(batch.sources as unknown as SourcePage[]).some(p => p.sourceKind === "VIDEO" && libraryVideoId(p.mediaUrl) === resourceId)) return new Response(null, { status: 404 });
    const file = await prisma.resourceFile.findFirst({ where: { id: resourceId, programId: batch.programId, status: "READY", archivedAt: null, mimeType: { in: ["video/mp4", "video/webm"] } } });
    if (!file?.storagePath) return new Response(null, { status: 404 });
    return serveResourceFile(file, request);
  } catch { return new Response(null, { status: 404 }); }
}
