"use client";

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
    <main dir="rtl" lang="ar" className="dlp-simple-page p-6">
      <div className="brand-card max-w-xl mx-auto p-8">
        <h1 className="text-xl font-bold mb-6">إضافة يوم تدريبي</h1>
        <form action={dispatch} className="space-y-4">
          <input type="hidden" name="programId" value={params.id} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">رقم اليوم (1–10) *</label>
            <input
              name="dayNumber"
              type="number"
              min={1}
              max={10}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">العنوان *</label>
            <input
              name="title"
              required
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              الأهداف (هدف في كل سطر)
            </label>
            <textarea
              name="objectives"
              rows={4}
              placeholder="فهم المفهوم الأساسي&#10;تطبيق المهارة&#10;تحليل الحالة"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ملخص المحتوى</label>
            <textarea
              name="contentSummary"
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          {state && !state.ok && (
            <p className="text-sm text-red-600">{state.error}</p>
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
              {isPending ? "جارٍ الإضافة…" : "إضافة اليوم"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
