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
        <div>
          <Link href="/dashboard">← الرئيسية</Link>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="dlp-form-page">
        <section className="brand-card dlp-form-card">
          <p className="dlp-form-eyebrow">إعداد المحتوى التدريبي</p>
          <h1>برنامج تدريبي جديد</h1>
          <p className="dlp-form-intro">أنشئ البرنامج أولًا، ثم أضف المادة والأيام والأسئلة والجلسات المباشرة.</p>

          <form action={dispatch} className="dlp-form-stack">
            <label htmlFor="new-title">عنوان البرنامج *</label>
            <input id="new-title" name="title" required />

            <label htmlFor="new-description">الوصف</label>
            <textarea id="new-description" name="description" rows={4} />

            <label htmlFor="new-language">اللغة</label>
            <select id="new-language" name="language" defaultValue="AR">
              <option value="AR">العربية</option>
              <option value="EN">الإنجليزية</option>
            </select>

            {state && !state.ok ? <p role="alert" className="dlp-form-error">{state.error}</p> : null}

            <div className="dlp-form-actions">
              <Link href="/dashboard" className="dlp-control-button neutral">إلغاء</Link>
              <button type="submit" disabled={isPending} className="dlp-control-button primary">
                {isPending ? "جارٍ إنشاء البرنامج…" : "إنشاء البرنامج"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
