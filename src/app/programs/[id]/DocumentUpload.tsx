"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeBlobUpload } from "@/app/actions/documents";
import { runDocumentSourcePreparation } from "@/lib/client/document-source";
import { runProgramRebuild } from "@/lib/client/program-rebuild";

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
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "busy" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [documentId, setDocumentId] = useState("");

  /** Upload success and source adoption are a dedicated stage.
   *  Do not generate or replace days/questions here. */
  async function startPipeline(docId: string, fileName: string, pageCount?: number) {
    setDocumentId(docId);
    setMessage(
      pageCount != null
        ? `تم رفع ${fileName} بنجاح (${pageCount} صفحة). جارٍ اعتماده كمصدر حقيقي…`
        : `تم رفع ${fileName} بنجاح. جارٍ اعتماده كمصدر حقيقي…`
    );

    const result = await runDocumentSourcePreparation({
      documentId: docId,
      onProgress: (text) => setMessage(text),
    });

    setMessage(
      `تم اعتماد ${fileName} كمصدر مرجعي: ${result.completedPages} صفحة حقيقية. جارٍ توليد 10 أيام و50 سؤالًا بالعربية…`
    );

    const rebuild = await runProgramRebuild({
      programId,
      documentId: docId,
      onProgress: (text) => setMessage(text),
    });

    if (rebuild.questionsGenerated !== 50 || rebuild.daysGenerated !== 10) {
      throw new Error(
        `اكتمل التوليد بعدد غير متوقع: ${rebuild.daysGenerated} أيام و${rebuild.questionsGenerated} سؤالًا.`
      );
    }

    setMessage(
      `اكتمل بنجاح: ${rebuild.daysGenerated} أيام و${rebuild.questionsGenerated} سؤالًا بالعربية.`
    );
    setStatus("success");
    router.refresh();
  }

  async function handleFile(file: File) {
    if (file.type !== "application/pdf") {
      setStatus("error");
      setMessage("يُسمح بملفات PDF فقط.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setStatus("error");
      setMessage("حجم الملف يتجاوز الحد الأقصى 50 ميغابايت.");
      return;
    }

    setStatus("busy");
    setMessage("جارٍ تجهيز الرفع…");

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
      setMessage(error instanceof Error ? error.message : "تعذر تنفيذ العملية");
    }
  }

  async function directUpload(file: File) {
    setMessage("جارٍ رفع ملف PDF…");
    const formData = new FormData();
    formData.append("programId", programId);
    formData.append("file", file);

    const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
    const parsed = await safeJson(res);

    if (!res.ok) {
      const errMsg = parsed.ok
        ? ((parsed.data as Record<string, unknown>).error as string) ?? "فشل رفع الملف."
        : `خطأ من الخادم (${res.status}). جرّب ملفًا أصغر أو أعد المحاولة.`;
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

    setMessage("جارٍ رفع الملف إلى التخزين…");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const pathname = `uploads/${programId}/${Date.now()}-${safeName}`;

    const blob = await uploadFn(pathname, file, {
      access: "private",
      handleUploadUrl: "/api/documents/upload-url",
      clientPayload: JSON.stringify({ programId }),
      onUploadProgress: ({ percentage }) => {
        setMessage(`جارٍ الرفع… ${Math.round(percentage)}%`);
      },
    });

    setMessage("جارٍ إنهاء عملية الرفع…");

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
        <h2 className="text-lg font-semibold">المادة التدريبية</h2>
        <p className="text-sm text-gray-500 mt-1">
          ارفع ملف PDF أولًا ليتم تحليله واعتماده كمصدر مرجعي. توليد الأيام والأسئلة يتم بعد اعتماد المصدر.
        </p>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => !busy && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          busy
            ? "border-teal-300 bg-teal-50 cursor-wait"
            : "border-gray-200 cursor-pointer hover:border-teal-400 hover:bg-teal-50"
        }`}
      >
        <p className="text-sm text-gray-500">
          {busy ? "جارٍ المعالجة…" : "اسحب ملف PDF إلى هنا أو اضغط لاختياره"}
        </p>
        <p className="text-xs text-gray-400 mt-1">PDF فقط · الحد الأقصى 50 MB</p>
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
          معرّف المادة: {documentId}
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
