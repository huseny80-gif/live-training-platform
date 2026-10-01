"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "./actions";
import type { LoginResult } from "./actions";
import { brand } from "@/lib/brand";

export default function LoginPage() {
  const [state, dispatch, isPending] = useActionState<LoginResult | null, FormData>(loginAction, null);
  const router = useRouter();

  useEffect(() => {
    if (state?.success) router.push("/dashboard");
  }, [state, router]);

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <div className="brand-card dlp-join-card space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-3">🎓</div>
          <h1 className="text-2xl font-black text-slate-900">{brand.nameAr}</h1>
          <p className="mt-2 text-sm text-slate-500">دخول المدرب إلى لوحة إدارة التدريب المباشر</p>
        </div>

        <form action={dispatch} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
            <input id="email" name="email" type="email" required autoComplete="email"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-1">كلمة المرور</label>
            <input id="password" name="password" type="password" required autoComplete="current-password"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500" />
          </div>
          {state && !state.success ? (
            <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{state.error}</p>
          ) : null}
          <button type="submit" disabled={isPending}
            className="w-full py-2.5 px-4 bg-teal-700 text-white rounded-xl font-bold hover:bg-teal-800 disabled:opacity-50">
            {isPending ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </main>
  );
}
