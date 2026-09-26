"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeBlobUpload } from "@/app/actions/documents";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 90; // 90 × 4s = 6 minutes

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
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [documentId, setDocumentId] = useState("");

  /** Poll /api/documents/status until COMPLETED or FAILED */
  async function pollUntilDone(docId: string): Promise<void> {
    for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      let pollRes: Response;
      try {
        pollRes = await fetch(`/api/documents/status?documentId=${encodeURIComponent(docId)}`);
      } catch {
        // network hiccup — keep polling
        continue;
      }

      if (!pollRes.ok) {
        // status endpoint failed — keep polling up to limit
        continue;
      }

      const parsed = await safeJson(pollRes);
      if (!parsed.ok) continue;

      const data = parsed.data as Record<string, unknown>;
      const s = data.extractionStatus as string;

      if (s === "COMPLETED") {
        setMessage("Generation completed successfully.");
        setStatus("success");
        router.refresh();
        return;
      }

      if (s === "FAILED") {
        const notes = (data.extractionNotes as string) ?? "Pipeline failed";
        throw new Error(notes);
      }

      if (s === "PROCESSING") {
        setMessage("Processing document… (this may take a few minutes)");
      }
    }
    throw new Error("Timed out waiting for document processing. Check back later.");
  }

  /** Fire-and-forget: start the pipeline, then poll for completion */
  async function startPipeline(docId: string, fileName: string, pageCount?: number) {
    setDocumentId(docId);
    setMessage(
      pageCount != null
        ? `Uploaded: ${fileName} (${pageCount} pages). Starting processing...`
        : `Uploaded: ${fileName}. Starting processing...`
    );

    const res = await fetch("/api/documents/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId, programId }),
    });

    if (!res.ok && res.status !== 202) {
      const parsed = await safeJson(res);
      const errMsg = parsed.ok
        ? ((parsed.data as Record<string, unknown>).error as string) ?? "Failed to start processing"
        : `Processing start failed (${res.status})`;
      throw new Error(errMsg);
    }

    const parsed = await safeJson(res);
    const pipelineStatus = parsed.ok
      ? (parsed.data as Record<string, unknown>).status
      : null;

    if (pipelineStatus === "COMPLETED") {
      // Document was already processed (idempotent path)
      setMessage("Document already processed.");
      setStatus("success");
      router.refresh();
      return;
    }

    setMessage("Processing document… (this may take a few minutes)");
    await pollUntilDone(docId);
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
        await directUpload(file);
      } else {
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
    await startPipeline(docId, data.fileName as string, data.pageCount as number | undefined);
  }

  async function blobUpload(file: File) {
    let uploadFn: typeof import("@vercel/blob/client").upload;
    try {
      ({ upload: uploadFn } = await import("@vercel/blob/client"));
    } catch {
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

    const doc = await completeBlobUpload(programId, blob.url, safeName);

    await startPipeline(doc.id, doc.fileName, doc.pageCount ?? undefined);
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
