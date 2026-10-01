"use client";

import { errorLabel } from "@/lib/labels";
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
    <main className="tp-min-h-screen tp-bg-gray-50 tp-p-6">
      <div className="tp-max-w-xl tp-mx-auto tp-bg-white tp-rounded-2xl tp-border tp-p-8">
        <h1 className="tp-text-xl tp-font-bold tp-mb-6">تعديل البرنامج</h1>
        <form action={dispatch} className="tp-space-y-4">
          <Field label="عنوان البرنامج" name="title" id="edit-title" />
          <div>
            <label htmlFor="edit-description" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">الوصف</label>
            <textarea
              id="edit-description"
              name="description"
              rows={3}
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="edit-language" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">لغة المحتوى</label>
            <select
              id="edit-language"
              name="language"
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            >
              <option value="">— دون تغيير —</option>
              <option value="AR">العربية</option>
              <option value="EN">الإنجليزية</option>
            </select>
          </div>
          <div>
            <label htmlFor="edit-status" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">الحالة</label>
            <select
              id="edit-status"
              name="status"
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            >
              <option value="">— دون تغيير —</option>
              <option value="DRAFT">مسودة</option>
              <option value="ACTIVE">نشط</option>
              <option value="ARCHIVED">مؤرشف</option>
            </select>
          </div>
          {state && !state.ok && (
            <p role="alert" className="tp-text-sm tp-text-red-600 tp-bg-red-50 tp-rounded-lg tp-px-3 tp-py-2">{errorLabel(state.error)}</p>
          )}
          <div className="tp-flex tp-gap-3 tp-pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="tp-flex-1 tp-py-2 tp-rounded-lg tp-border tp-text-sm tp-hover-bg-gray-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="tp-flex-1 tp-py-2 tp-rounded-lg tp-bg-blue-600 tp-text-white tp-text-sm tp-hover-bg-blue-700 tp-disabled-opacity-50"
            >
              {isPending ? "جاري الحفظ…" : "حفظ التغييرات"}
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
      <label htmlFor={id} className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">{label}</label>
      <input
        id={id}
        name={name}
        className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
      />
    </div>
  );
}
