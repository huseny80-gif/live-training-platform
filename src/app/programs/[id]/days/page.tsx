"use client";

import { errorLabel } from "@/lib/labels";
import { useActionState } from "react";
import { createDay } from "@/app/actions/days";
import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import type { ActionResult } from "@/app/actions/programs";

export default function AddDayPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [state, dispatch, isPending] = useActionState<ActionResult<{ id: string }> | null, FormData>(
    createDay,
    null
  );

  useEffect(() => {
    if (state?.ok) router.push(`/programs/${params.id}`);
  }, [state, router, params.id]);

  return (
    <main className="tp-min-h-screen tp-bg-gray-50 tp-p-6">
      <div className="tp-max-w-xl tp-mx-auto tp-bg-white tp-rounded-2xl tp-border tp-p-8">
        <h1 className="tp-text-xl tp-font-bold tp-mb-6">إضافة يوم تدريبي</h1>
        <form action={dispatch} className="tp-space-y-4">
          <input type="hidden" name="programId" value={params.id} />
          <div>
            <label className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">رقم اليوم (١–١٠) *</label>
            <input
              name="dayNumber"
              type="number"
              min={1}
              max={10}
              required
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          <div>
            <label className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">عنوان اليوم *</label>
            <input
              name="title"
              required
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          <div>
            <label className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">
              الأهداف (هدف في كل سطر)
            </label>
            <textarea
              name="objectives"
              rows={4}
              placeholder="أدخل أهداف اليوم التدريبي، كل هدف في سطر مستقل"
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          <div>
            <label className="tp-block tp-text-sm tp-font-medium tp-text-gray-700 tp-mb-1">ملخص المحتوى</label>
            <textarea
              name="contentSummary"
              rows={3}
              className="tp-w-full tp-rounded-lg tp-border tp-px-3 tp-py-2 tp-text-sm tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          {state && !state.ok && (
            <p className="tp-text-sm tp-text-red-600">{errorLabel(state.error)}</p>
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
              {isPending ? "جاري الإضافة…" : "إضافة اليوم"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
