"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createProgram } from "@/app/actions/programs";
import type { ActionResult } from "@/app/actions/programs";
import { brand } from "@/lib/brand";

export default function NewProgramPage() {
  const [state, dispatch, isPending] = useActionState<ActionResult<{ id: string }> | null, FormData>(createProgram, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) router.push(`/programs/${state.data.id}`);
  }, [state, router]);

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">← الرئيسية</Link>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <section className="brand-card p-6 md:p-8">
          <div className="mb-6">
            <p className="text-sm font-bold text-teal-700">إعداد المحتوى التدريبي</p>
            <h1 className="text-2xl font-black text-slate-900 mt-1">برنامج تدريبي جديد</h1>
            <p className="text-sm text-slate-500 mt-2">أنشئ البرنامج أولًا، ثم أضف المادة والأيام والأسئلة والجلسات.</p>
          </div>

          <form action={dispatch} className="space-y-5">
            <Field label="عنوان البرنامج *" name="title" id="new-title" required />
            <div>
              <label htmlFor="new-description" className="block text-sm font-bold text-slate-700 mb-1">الوصف</label>
              <textarea id="new-description" name="description" rows={4}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
            <div>
              <label htmlFor="new-language" className="block text-sm font-bold text-slate-700 mb-1">اللغة</label>
              <select id="new-language" name="language" defaultValue="AR"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500">
                <option value="AR">العربية</option>
                <option value="EN">الإنجليزية</option>
              </select>
            </div>

            {state && !state.ok ? (
              <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{state.error}</p>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link href="/dashboard" className="flex-1 py-2.5 rounded-xl border border-slate-300 text-sm text-center font-bold hover:bg-slate-50">
                إلغاء
              </Link>
              <button type="submit" disabled={isPending}
                className="flex-1 py-2.5 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-800 disabled:opacity-50">
                {isPending ? "جارٍ إنشاء البرنامج…" : "إنشاء البرنامج"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function Field({ label, name, id, required }: { label: string; name: string; id: string; required?: boolean }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-bold text-slate-700 mb-1">{label}</label>
      <input id={id} name={name} required={required}
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
    </div>
  );
}
