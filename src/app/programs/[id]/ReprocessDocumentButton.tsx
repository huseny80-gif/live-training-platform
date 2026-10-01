"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runProgramRebuild } from "@/lib/client/program-rebuild";
import { runDocumentSourcePreparation } from "@/lib/client/document-source";

export default function ReprocessDocumentButton({
  programId,
  documentId,
  status,
  totalQuestions,
  sourceReady,
  realPageCount,
  requiredPageCount,
}: {
  programId: string;
  documentId: string;
  status: string;
  totalQuestions: number;
  sourceReady: boolean;
  realPageCount: number;
  requiredPageCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const label = !sourceReady
    ? status === "PROCESSING"
      ? "متابعة اعتماد المصدر"
      : status === "FAILED" || status === "OCR_REQUIRED"
      ? "إعادة اعتماد المصدر"
      : "اعتماد الملف كمصدر"
    : totalQuestions === 0
    ? "إنشاء 50 سؤالًا"
    : "إعادة بناء المحتوى";

  async function handleClick() {
    setBusy(true);

    try {
      if (!sourceReady) {
        setMessage(
          `جارٍ اعتماد المصدر… التغطية الحالية ${realPageCount}/${requiredPageCount} صفحة حقيقية.`
        );

        const result = await runDocumentSourcePreparation({
          documentId,
          onProgress: (text) => setMessage(text),
        });

        setMessage(
          `تم اعتماد الملف كمصدر مرجعي: ${result.completedPages} صفحة حقيقية. جارٍ الآن توليد 10 أيام و50 سؤالًا بالعربية…`
        );

        const rebuild = await runProgramRebuild({
          programId,
          documentId,
          onProgress: (text) => setMessage(text),
        });

        setMessage(
          `اكتمل بنجاح: ${rebuild.daysGenerated} أيام و${rebuild.questionsGenerated} سؤالًا بالعربية.`
        );
        router.refresh();
        return;
      }

      const destructive = totalQuestions > 0;
      if (
        destructive &&
        !confirm(
          "سيُعاد بناء الأيام والأسئلة من المصدر المعتمد. لن يُستبدل المحتوى الحالي إلا بعد نجاح التوليد الكامل. متابعة؟"
        )
      ) {
        return;
      }

      setMessage("المصدر معتمد. جارٍ بدء توليد المحتوى والأسئلة…");

      const result = await runProgramRebuild({
        programId,
        documentId,
        onProgress: (text) => setMessage(text),
      });

      setMessage(
        "اكتمل: " +
          result.daysGenerated +
          " أيام و" +
          result.questionsGenerated +
          " سؤالًا."
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر إكمال العملية.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dlp-doc-process">
      <button
        type="button"
        className="dlp-control-button primary compact"
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? "جارٍ المعالجة…" : label}
      </button>
      {message ? (
        <small className={busy ? "dlp-process-note busy" : "dlp-process-note"}>
          {message}
        </small>
      ) : null}
    </div>
  );
}
