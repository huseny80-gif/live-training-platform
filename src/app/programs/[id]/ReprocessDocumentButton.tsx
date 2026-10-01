"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { runProgramRebuild } from "@/lib/client/program-rebuild";

export default function ReprocessDocumentButton({
  programId,
  documentId,
  status,
  totalQuestions,
}: {
  programId: string;
  documentId: string;
  status: string;
  totalQuestions: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const label =
    status === "PENDING"
      ? "بدء المعالجة"
      : status === "PROCESSING"
      ? "متابعة المعالجة"
      : status === "FAILED" || status === "OCR_REQUIRED"
      ? "إعادة المعالجة"
      : totalQuestions === 0
      ? "إنشاء 50 سؤالًا"
      : "إعادة بناء المحتوى";

  async function handleClick() {
    const destructive = totalQuestions > 0;
    if (
      destructive &&
      !confirm(
        "سيُعاد بناء الأيام والأسئلة من ملف PDF الحقيقي. لن يُستبدل المحتوى الحالي إلا بعد نجاح التوليد الكامل. متابعة؟"
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("جارٍ بدء المعالجة…");

    try {
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
      setMessage(error instanceof Error ? error.message : "تعذر إكمال المعالجة.");
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
