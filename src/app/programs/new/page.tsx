"use client";

import { errorLabel } from "@/lib/labels";
import { useActionState } from "react";
import { createProgram } from "@/app/actions/programs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ActionResult } from "@/app/actions/programs";

export default function NewProgramPage() {
  const [state, dispatch, isPending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createProgram,
    null
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/programs/${state.data.id}`);
  }, [state, router]);

  return (
    <main className="tp-min-h-screen tp-bg-gray-50 tp-p-6">
      <div className="tp-max-w-xl tp-mx-auto tp-bg-white tp-rounded-2xl tp-border tp-p-8">
        <h1 className="tp-text-xl tp-font-bold tp-mb-6">إنشاء برنامج تدريبي</h1>
        <form action={dispatch} className="tp-space-y-4">
          <Field label="عنوان البرنامج *" name="title" id="new-title" required />
          <div>
            <label htmlFor="new-description" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">الوصف</label>
            <textarea
              id="new-description"
              name="description"
              rows={3}
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="new-language" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">لغة المحتوى</label>
            <select
              id="new-language"
              name="language"
              defaultValue="AR"
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            >
              <option value="AR">العربية</option>
              <option value="EN">الإنجليزية</option>
            </select>
          </div>
          {state && !state.ok && (
            <p role="alert" className="tp-text-sm tp-text-red-600 tp-bg-red-50 tp-rounded-lg tp-px-3 tp-py-2">{errorLabel(state.error)}</p>
          )}
          <div className="tp-flex tp-gap-3 tp-pt-2">
            <a
  href="/dashboard"
  className="tp-flex-1 tp-py-2 tp-rounded-lg tp-border tp-text-sm tp-hover-bg-gray-50 tp-text-center"
>
  إلغاء
</a>
            <button
              type="submit"
              disabled={isPending}
              className="tp-flex-1 tp-py-2 tp-rounded-lg tp-bg-blue-600 tp-text-white tp-text-sm tp-hover-bg-blue-700 tp-disabled-opacity-50"
            >
              {isPending ? "جاري الإنشاء…" : "إنشاء البرنامج"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function Field({ label, name, id, required }: { label: string; name: string; id: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">{label}</label>
      <input
        id={id}
        name={name}
        required={required}
        className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
      />
    </div>
  );
}
