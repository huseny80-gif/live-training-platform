"use client";

import { useRef, useState } from "react";
import { generateProgramContent } from "@/app/actions/generation";
import { triggerExtraction, completeBlobUpload, markDocumentFailed } from "@/app/actions/documents";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

// Safe JSON parser — never throws on HTML error pages or empty bodies
async function safeJson(res: Response): Promise<{ ok: true; data: unknown } | { ok: false; text: string }> {
  const text = await res.text();
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    return { ok: false, text };
  }
}

export default function DocumentUpload({ programId }: { programId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [documentId, setDocumentId] = useState("");

  async function runPipeline(docId: string, fileName: string, pageCount?: number) {
    setDocumentId(docId);
    setMessage(
      pageCount != null
        ? `Uploaded: ${fileName} (${pageCount} pages). Starting extraction...`
        : `Uploaded: ${fileName}. Starting extraction...`
    );

    await triggerExtraction(docId);

    setMessage("Extraction completed. Starting AI generation...");

    await generateProgramContent(programId, docId);

    setMessage("Generation completed successfully. Refreshing...");
    window.location.reload();
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      setStatus("error");
      setMessage("Only PDF files are accepted.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setStatus("error");
      setMessage("File exceeds the 50 MB limit.");
      return;
    }

    setStatus("busy");
    setMessage("Preparing upload...");

    try {
      // Ask server which upload mode to use
      const modeRes = await fetch("/api/documents/upload-url");
      const modeParsed = await safeJson(modeRes);
      const mode =
        modeParsed.ok && (modeParsed.data as Record<string, unknown>)?.mode === "direct"
          ? "direct"
          : "blob";

      if (mode === "direct") {
        // Local dev: direct multipart upload (no Vercel infra limits locally)
        await directUpload(file);
      } else {
        // Production: client uploads directly to Vercel Blob CDN, bypassing
        // the 4.5 MB serverless function body limit
        await blobUpload(file);
      }
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Operation failed");
    }
  }

  async function directUpload(file: File) {
    setMessage("Uploading PDF...");
    const formData = new FormData();
    formData.append("programId", programId);
    formData.append("file", file);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const parsed = await safeJson(res);

    if (!res.ok) {
      const errMsg = parsed.ok
        ? ((parsed.data as Record<string, unknown>).error as string) ?? "Upload failed."
        : `Server error (${res.status}). Try a smaller file or contact support.`;
      throw new Error(errMsg);
    }

    const data = parsed.ok ? (parsed.data as Record<string, unknown>) : {};
    const docId = data.documentId as string;
    try {
      await runPipeline(docId, data.fileName as string, data.pageCount as number);
      setStatus("success");
    } catch (pipelineErr) {
      try { await markDocumentFailed(docId); } catch { /* best-effort */ }
      throw pipelineErr;
    }
  }

  async function blobUpload(file: File) {
    // Dynamic import — only loaded in the blob path (production)
    let uploadFn: typeof import("@vercel/blob/client").upload;
    try {
      ({ upload: uploadFn } = await import("@vercel/blob/client"));
    } catch {
      // @vercel/blob not installed — fall back to direct upload
      return directUpload(file);
    }

    setMessage("Uploading to storage...");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `uploads/${programId}/${Date.now()}-${safeName}`;

    const blob = await uploadFn(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/documents/upload-url",
      clientPayload: JSON.stringify({ programId }),
      onUploadProgress: ({ percentage }) => {
        setMessage(`Uploading... ${Math.round(percentage)}%`);
      },
    });

    setMessage("Finalizing upload...");

    // Register the document directly — deterministic and works on localhost,
    // unlike the blob.upload-completed webhook (which is fired by Vercel's
    // infra and can't reach a local dev server). Idempotent server-side, so
    // it's safe even if the webhook also runs.
    const doc = await completeBlobUpload(programId, blob.url, safeName);

    try {
      await runPipeline(doc.id, doc.fileName, doc.pageCount ?? undefined);
      setStatus("success");
    } catch (pipelineErr) {
      // Mark the document FAILED so it doesn't stay stuck in PENDING/PROCESSING
      try { await markDocumentFailed(doc.id); } catch { /* best-effort */ }
      throw pipelineErr;
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (status === "busy") return;
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  const busy = status === "busy";

  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Training Document</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload a PDF to extract content and generate training days, topics,
          and questions.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          busy
            ? "border-blue-300 bg-blue-50 cursor-wait"
            : "border-gray-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50"
        }`}
      >
        <p className="text-sm text-gray-500">
          {busy ? "Processing..." : "Drag & drop a PDF here, or click to select"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF only · max 50 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={handleChange}
          className="hidden"
        />
      </div>

      {documentId && (
        <p className="text-xs text-gray-500">
          Document ID: {documentId}
        </p>
      )}

      {message && (
        <div
          className={`text-sm rounded-lg p-3 border ${
            status === "error"
              ? "text-red-700 bg-red-50"
              : status === "success"
              ? "text-green-700 bg-green-50"
              : "text-gray-700 bg-gray-50"
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
}
