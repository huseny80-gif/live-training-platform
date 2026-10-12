import { storage } from "@/lib/storage";
import type { ResourceFile } from "@prisma/client";
export async function serveResourceFile(file: ResourceFile, request: Request) {
    if (!file.storagePath || file.archivedAt || file.status !== "READY") return new Response(null, { status: 404 });
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const { issueSignedToken, presignUrl } = await import("@vercel/blob");
      const validUntil = Date.now() + (file.mimeType.startsWith("video/") ? 120 : 10) * 60_000;
      const signed = await issueSignedToken({ pathname: file.blobPath, operations: ["get"], validUntil });
      const { presignedUrl } = await presignUrl(signed, { operation: "get", pathname: file.blobPath, access: "private", validUntil });
      const url = new URL(presignedUrl); if (new URL(request.url).searchParams.get("download") === "1") url.searchParams.set("download", "1");
      return new Response(null, { status: 302, headers: { Location: url.toString(), "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
    }
    const bytes = await storage.read(file.storagePath);
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": file.mimeType, "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox" } });
}
