// Production upload-url route: generates a Vercel Blob client token so the
// browser can upload directly to blob storage — the large PDF body never passes
// through a Vercel Function, avoiding the 4.5 MB serverless body limit.
//
// Phase 1 (blob.generate-client-token): verifies auth + ownership, returns token.
// Phase 2 (blob.upload-completed):      inspects uploaded PDF, saves DB record.
//
// If BLOB_READ_WRITE_TOKEN is absent (local dev), returns {mode:'direct'} so the
// client falls back to the existing /api/documents/upload multipart route.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { registerBlobUpload } from "@/app/actions/documents";

// Lightweight mode check — lets the client pick direct-upload vs blob-upload
// without invoking the blob protocol handshake below.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ mode: process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "direct" });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Local dev fallback: blob storage not configured ---
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ mode: "direct" });
  }

  // Lazy import so the module only loads when blob is actually configured
  const { handleUpload } = await import("@vercel/blob/client").catch(() => {
    throw new Error("@vercel/blob is not installed");
  });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  }

  // Phase 0 mode-check: client sends { type: "check" } to discover upload mode.
  // handleUpload rejects unknown event types, so intercept this before calling it.
  if ((body as Record<string, unknown>)?.type === "check") {
    return NextResponse.json({ mode: "blob" });
  }

  // handleUpload manages both phases of the Vercel Blob client-upload protocol
  let jsonResponse: unknown;
  try {
    jsonResponse = await handleUpload({
      body: body as Parameters<typeof handleUpload>[0]["body"],
      request,

      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // Phase 1: verify auth + ownership before issuing upload token
        const session = await auth();
        if (!session?.user?.id) throw new Error("UNAUTHORIZED");

        let programId: string | undefined;
        try {
          ({ programId } = JSON.parse(clientPayload ?? "{}"));
        } catch {
          throw new Error("INVALID_CLIENT_PAYLOAD");
        }
        if (!programId) throw new Error("MISSING_PROGRAM_ID");

        const program = await prisma.trainingProgram.findFirst({
          where: { id: programId, instructorId: session.user.id },
          select: { id: true },
        });
        if (!program) throw new Error("PROGRAM_NOT_FOUND");

        // Pin the token to this program's own path namespace. pathname is
        // otherwise entirely client-controlled, so without this check a token
        // issued for a program the caller owns could be used to write under
        // any other program's path (e.g. "uploads/<victim-programId>/...").
        const expectedPrefix = `uploads/${programId}/`;
        const rest = pathname.startsWith(expectedPrefix)
          ? pathname.slice(expectedPrefix.length)
          : null;
        if (!rest || rest.includes("/")) {
          throw new Error("INVALID_PATHNAME");
        }

        return {
          // @vercel/blob 2.8.0's client-token options have no `access` field —
          // access is set by the browser's own upload() call and is verified
          // after the fact (hostname + pathname) in registerBlobUpload, since
          // it can't be pinned here.
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: 50 * 1024 * 1024,
          // The client-supplied pathname (uploads/<programId>/<timestamp>-<name>)
          // has no unguessable component of its own — addRandomSuffix makes
          // Vercel append one, so the resulting blob URL can't be predicted
          // from a known programId and rough upload time.
          addRandomSuffix: true,
          // tokenPayload is signed by Vercel — safe to trust in onUploadCompleted
          tokenPayload: JSON.stringify({
            instructorId: session.user.id,
            programId,
          }),
        };
      },

      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Phase 2: blob is on CDN. This webhook is fired by Vercel's infra and
        // cannot reach localhost, so it's a best-effort safety net — the client
        // normally registers the document itself via the completeBlobUpload
        // action right after upload. registerBlobUpload is idempotent, so
        // whichever path runs first wins and the other is a no-op.
        const { instructorId, programId } = JSON.parse(tokenPayload ?? "{}");
        if (!instructorId || !programId) throw new Error("INVALID_TOKEN_PAYLOAD");

        const rawName = blob.pathname.split("/").pop() ?? "upload.pdf";
        await registerBlobUpload({
          instructorId,
          programId,
          blobUrl: blob.url,
          fileName: rawName,
        });
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UPLOAD_ERROR";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json(jsonResponse);
}
