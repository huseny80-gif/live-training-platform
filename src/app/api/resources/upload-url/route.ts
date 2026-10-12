import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sameOrigin, smallJson } from "@/lib/exam-material/http";
import { completeResource, resourceForOwner } from "@/lib/resources/service";
export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "التخزين المباشر غير متاح." }, { status: 400 });
  try {
    const { handleUpload } = await import("@vercel/blob/client");
    const result = await handleUpload({ request, body: await smallJson(request) as Parameters<typeof handleUpload>[0]["body"],
      onBeforeGenerateToken: async (pathname, payload) => {
        if (!sameOrigin(request)) throw new Error("FORBIDDEN");
        const user = await auth(); if (!user?.user?.id) throw new Error("UNAUTHORIZED");
        const { id } = JSON.parse(payload ?? "{}");
        const file = await resourceForOwner(id, user.user.id);
        if (file.blobPath !== pathname || file.status !== "PENDING" || file.archivedAt || file.createdAt.getTime() < Date.now() - 60 * 60_000) throw new Error("INVALID_UPLOAD");
        return { allowedContentTypes: [file.mimeType], maximumSizeInBytes: Number(file.sizeBytes), addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 60 * 60_000, tokenPayload: JSON.stringify({ id, owner: user.user.id }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => { const { id, owner } = JSON.parse(tokenPayload ?? "{}"); await completeResource(id, owner, blob.url); },
    });
    return NextResponse.json(result);
  } catch { return NextResponse.json({ error: "تعذّر تفويض رفع الملف. تحقق من الحساب والمورد وأعد المحاولة." }, { status: 400 }); }
}
