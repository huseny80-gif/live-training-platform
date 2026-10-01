"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { errorLabel } from "@/lib/labels";
import { documentErrorLabel } from "@/lib/document-errors";
import { completeBlobUpload } from "@/app/actions/documents";

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 120; // Allow stale serverless jobs to be recovered after 6 minutes

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
        setMessage("اكتمل تجهيز المحتوى بنجاح.");
        setStatus("success");
        router.refresh();
        return;
      }

      if (s === "FAILED" || s === "OCR_REQUIRED") {
        const notes = (data.extractionNotes as string) ?? "تعذّر تجهيز المستند";
        router.refresh();
        throw new Error(documentErrorLabel(notes));
      }

      if (s === "PROCESSING") {
        setMessage("جاري معالجة المستند… قد يستغرق ذلك بضع دقائق");
      }
    }
    throw new Error("استغرقت معالجة المستند وقتاً طويلاً. تحقق من حالته لاحقاً.");
  }

  /** Fire-and-forget: start the pipeline, then poll for completion */
  async function startPipeline(docId: string, fileName: string, pageCount?: number) {
    setDocumentId(docId);
    setMessage(
      pageCount != null
        ? `تم رفع ${fileName} (${pageCount} صفحة). جاري المعالجة…`
        : `تم رفع ${fileName}. جاري المعالجة…`
    );

    const res = await fetch("/api/documents/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId: docId, programId }),
    });

    if (!res.ok && res.status !== 202) {
      const parsed = await safeJson(res);
      const errMsg = parsed.ok
        ? ((parsed.data as Record<string, unknown>).error as string) ?? "تعذّر بدء المعالجة"
        : `تعذّر بدء المعالجة`;
      throw new Error(errMsg);
    }

    const parsed = await safeJson(res);
    const pipelineStatus = parsed.ok
      ? (parsed.data as Record<string, unknown>).status
      : null;

    if (pipelineStatus === "COMPLETED") {
      // Document was already processed (idempotent path)
      setMessage("تم تجهيز هذا المستند سابقاً.");
      setStatus("success");
      router.refresh();
      return;
    }

    setMessage("جاري معالجة المستند… قد يستغرق ذلك بضع دقائق");
    await pollUntilDone(docId);
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      setStatus("error");
      setMessage("يُسمح بملفات PDF فقط.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setStatus("error");
      setMessage("حجم الملف يتجاوز الحد المسموح (٥٠ ميغابايت).");
      return;
    }

    setStatus("busy");
    setMessage("جاري تجهيز الملف للرفع…");

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
      setMessage(error instanceof Error && /[\u0600-\u06FF]/.test(error.message) ? error.message : errorLabel(error instanceof Error ? error.message : "UPLOAD_ERROR"));
    }
  }

  async function directUpload(file: File) {
    setMessage("جاري رفع المستند…");
    const formData = new FormData();
    formData.append("programId", programId);
    formData.append("file", file);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const parsed = await safeJson(res);

    if (!res.ok) {
      const errMsg = parsed.ok
        ? ((parsed.data as Record<string, unknown>).error as string) ?? "تعذّر رفع الملف."
        : `تعذّر رفع الملف. جرّب ملفاً أصغر أو تواصل مع الدعم.`;
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

    setMessage("جاري رفع المستند…");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `uploads/${programId}/${Date.now()}-${safeName}`;

    const blob = await uploadFn(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/documents/upload-url",
      clientPayload: JSON.stringify({ programId }),
      onUploadProgress: ({ percentage }) => {
        setMessage(`جاري الرفع… ${Math.round(percentage)}%`);
      },
    });

    setMessage("جاري إكمال الرفع…");

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
    <section className="tp-bg-white tp-rounded-xl tp-border tp-p-6 tp-space-y-4">
      <div>
        <h2 className="tp-text-lg tp-font-semibold">المستند التدريبي</h2>
        <p className="tp-text-sm tp-text-gray-500 tp-mt-1">
          ارفع مستند PDF لاستخراج المحتوى وتجهيز الأيام التدريبية والموضوعات والأسئلة.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`tp-border-2 tp-border-dashed tp-rounded-lg tp-p-8 tp-text-center tp-transition-colors ${
          busy
            ? "tp-border-blue-300 tp-bg-blue-50 tp-cursor-wait"
            : "tp-border-gray-200 tp-cursor-pointer tp-hover-border-blue-400 tp-hover-bg-blue-50"
        }`}
      >
        <p className="tp-text-sm tp-text-gray-500">
          {busy ? "جاري المعالجة…" : "اسحب مستند PDF إلى هنا أو اضغط لاختيار الملف"}
        </p>
        <p className="tp-text-xs tp-text-gray-400 tp-mt-1">ملفات PDF فقط · بحد أقصى ٥٠ ميغابايت</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={handleChange}
          className="tp-hidden"
        />
      </div>

      {documentId && (
        <p className="tp-text-xs tp-text-gray-500">
          تم رفع المستند وجاري متابعة حالته.
        </p>
      )}

      {message && (
        <div
          className={`tp-text-sm tp-rounded-lg tp-p-3 tp-border ${
            status === "error"
              ? "tp-text-red-700 tp-bg-red-50"
              : status === "success"
              ? "tp-text-green-700 tp-bg-green-50"
              : "tp-text-gray-700 tp-bg-gray-50"
          }`}
        >
          {message}
        </div>
      )}
    </section>
  );
}
