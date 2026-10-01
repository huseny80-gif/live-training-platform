"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDocument } from "@/app/actions/documents";

export default function DeleteDocumentButton({
  documentId,
  fileName,
  status,
}: {
  documentId: string;
  fileName: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    const label =
      status === "PROCESSING" || status === "PENDING"
        ? "هذه المادة ما زالت قيد المعالجة. سيؤدي حذفها إلى إزالة سجل الرفع والملف المخزن."
        : "سيتم حذف سجل المادة والملف المخزن. الأيام والأسئلة المنشأة مسبقًا ستبقى محفوظة.";

    if (!confirm(`حذف المادة "${fileName}"؟\n\n${label}`)) return;

    setError(null);
    startTransition(async () => {
      try {
        await deleteDocument(documentId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "تعذر حذف المادة.");
      }
    });
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="dlp-danger-button"
        style={{ marginTop: 0 }}
      >
        {pending ? "جارٍ الحذف…" : "حذف المادة"}
      </button>
      {error ? <small style={{ color: "var(--brand-danger)" }}>{error}</small> : null}
    </span>
  );
}
