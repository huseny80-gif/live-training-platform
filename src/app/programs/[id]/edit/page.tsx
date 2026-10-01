"use client";

import { useActionState } from "react";
import { updateProgram } from "@/app/actions/programs";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import type { ActionResult } from "@/app/actions/programs";

export default function EditProgramPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const action = updateProgram.bind(null, params.id);

  const [state, dispatch, isPending] = useActionState<ActionResult | null, FormData>(
    action,
    null
  );

  useEffect(() => {
    if (state?.ok) router.push(`/programs/${params.id}`);
  }, [state, router, params.id]);

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page p-6">
      <div className="brand-card max-w-xl mx-auto p-8">
        <h1 className="text-xl font-bold mb-6">تعديل البرنامج</h1>
        <form action={dispatch} className="space-y-4">
          <Field label="العنوان" name="title" id="edit-title" />
          <div>
            <label htmlFor="edit-description" className="block text-sm font-medium text-gray-700 mb-1">الوصف</label>
            <textarea
              id="edit-description"
              name="description"
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label htmlFor="edit-language" className="block text-sm font-medium text-gray-700 mb-1">اللغة</label>
            <select
              id="edit-language"
              name="language"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">— بدون تغيير —</option>
              <option value="AR">العربية</option>
              <option value="EN">الإنجليزية</option>
            </select>
          </div>
          <div>
            <label htmlFor="edit-status" className="block text-sm font-medium text-gray-700 mb-1">الحالة</label>
            <select
              id="edit-status"
              name="status"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">— بدون تغيير —</option>
              <option value="DRAFT">مسودة</option>
              <option value="ACTIVE">نشط</option>
              <option value="ARCHIVED">مؤرشف</option>
            </select>
          </div>
          {state && !state.ok && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{state.error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-2 rounded-lg border text-sm hover:bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 py-2 rounded-lg bg-teal-700 text-white text-sm hover:bg-teal-800 disabled:opacity-50"
            >
              {isPending ? "جارٍ الحفظ…" : "حفظ التغييرات"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({ label, name, id }: { label: string; name: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        id={id}
        name={name}
        className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
      />
    </div>
  );
}
