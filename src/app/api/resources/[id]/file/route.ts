import { auth } from "@/lib/auth";
import { serveResourceFile } from "@/lib/resources/serve-file";
import { resourceForOwner } from "@/lib/resources/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await auth(); if (!user?.user?.id) return new Response(null, { status: 401 });
  try {
    const file = await resourceForOwner((await params).id, user.user.id);
    if (file.status !== "READY" || file.archivedAt || !file.storagePath) return new Response(null, { status: 404 });
    return serveResourceFile(file, request);
  } catch { return new Response(null, { status: 404 }); }
}
