"use client";

import { useState, useTransition } from "react";
import { resetLiveSession } from "@/app/actions/sessions";
import { useRouter } from "next/navigation";

export default function ResetSessionButton({
  sessionId,
  programId,
}: {
  sessionId: string;
  programId: string;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleReset() {
    startTransition(async () => {
      await resetLiveSession(sessionId);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="tp-px-4 tp-py-2 tp-bg-red-50 tp-text-red-600 tp-border tp-border-red-200 tp-rounded-lg tp-text-sm tp-hover-bg-red-100"
      >
        🔄 تصفير الجلسة
      </button>

      {open && (
        <div className="tp-fixed tp-inset-0 tp-bg-black-40 tp-flex tp-items-center tp-justify-center tp-z-50 tp-p-4">
          <div
            dir="rtl"
            lang="ar"
            className="tp-bg-white tp-rounded-2xl tp-p-6 tp-max-w-sm tp-w-full tp-shadow-xl tp-space-y-4"
          >
            <div className="tp-text-center tp-space-y-2">
              <div className="tp-text-4xl">⚠️</div>
              <h2 className="tp-text-lg tp-font-bold tp-text-gray-900">تأكيد تصفير الجلسة</h2>
              <p className="tp-text-sm tp-text-gray-600">
                سيتم حذف جميع المشاركين وإجاباتهم ونتائجهم. لن يتأثر بنك الأسئلة.
              </p>
              <p className="tp-text-sm tp-font-medium tp-text-red-600">هذا الإجراء لا يمكن التراجع عنه.</p>
            </div>

            <div className="tp-flex tp-gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="tp-flex-1 tp-py-2-5 tp-rounded-xl tp-border tp-text-sm tp-font-medium tp-hover-bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleReset}
                disabled={isPending}
                className="tp-flex-1 tp-py-2-5 tp-rounded-xl tp-bg-red-600 tp-text-white tp-text-sm tp-font-medium tp-hover-bg-red-700 tp-disabled-opacity-60"
              >
                {isPending ? "جاري التصفير…" : "تصفير الجلسة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
