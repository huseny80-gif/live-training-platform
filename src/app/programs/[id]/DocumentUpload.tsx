"use client";

import { useState } from "react";
import { generateProgramContent } from "@/app/actions/generation";
import { triggerExtraction } from "@/app/actions/documents";

export default function DocumentUpload({ programId }: { programId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [documentId, setDocumentId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function upload() {
    if (!file) return;

    setBusy(true);
    setStatus("Uploading PDF...");

    try {
      const formData = new FormData();
      formData.append("programId", programId);
      formData.append("file", file);

      const response = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "UPLOAD_FAILED");
      }

      setDocumentId(data.documentId);
      setStatus(
        `Uploaded: ${data.fileName} (${data.pageCount} pages). Starting extraction...`
      );

      await triggerExtraction(data.documentId);

      setStatus("Extraction completed. Starting AI generation...");

      await generateProgramContent(programId, data.documentId);

      setStatus("Generation completed successfully. Refreshing...");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Training Document</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload a PDF to extract content and generate training days, topics,
          and questions.
        </p>
      </div>

      <input
        type="file"
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="block w-full text-sm"
      />

      <button
        type="button"
        disabled={!file || busy}
        onClick={upload}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
      >
        {busy ? "Processing..." : "Upload PDF & Generate"}
      </button>

      {documentId && (
        <p className="text-xs text-gray-500">
          Document ID: {documentId}
        </p>
      )}

      {status && (
        <div className="text-sm bg-gray-50 border rounded-lg p-3">
          {status}
        </div>
      )}
    </section>
  );
}
