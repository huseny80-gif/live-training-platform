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
        className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm hover:bg-red-100"
      >
        🔄 تصفير الجلسة
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div
            dir="rtl"
            lang="ar"
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl space-y-4"
          >
            <div className="text-center space-y-2">
              <div className="text-4xl">⚠️</div>
              <h2 className="text-lg font-bold text-gray-900">تأكيد تصفير الجلسة</h2>
              <p className="text-sm text-gray-600">
                سيتم حذف جميع المشاركين وإجاباتهم ونتائجهم. لن يتأثر بنك الأسئلة.
              </p>
              <p className="text-sm font-medium text-red-600">هذا الإجراء لا يمكن التراجع عنه.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50"
              >
                إلغاء
              </button>
              <button
                onClick={handleReset}
                disabled={isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-60"
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
