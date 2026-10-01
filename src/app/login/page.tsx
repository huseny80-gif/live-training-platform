"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { LoginResult } from "./actions";

export default function LoginPage() {
  const [state, dispatch, isPending] = useActionState<LoginResult | null, FormData>(
    loginAction,
    null
  );
  const router = useRouter();

  useEffect(() => {
    if (state?.success) {
      router.push("/dashboard");
    }
  }, [state, router]);

  return (
    <main className="dlp-participant-page">
      <div className="brand-card dlp-join-card">
        <header className="tp-form-heading"><div className="tp-brand-mark" aria-hidden="true">ح</div><h1>الحقيبة التدريبية</h1><p>تسجيل دخول المدرب</p></header>
        <form action={dispatch} className="tp-form">
          <div>
            <label htmlFor="email" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              name="email"
              dir="ltr"
              type="email"
              required
              autoComplete="email"
              className="tp-mt-1 tp-block tp-w-full tp-rounded-lg tp-border tp-border-gray-300 tp-px-3 tp-py-2 tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="password" className="tp-block tp-text-sm tp-font-medium tp-text-gray-700">
              كلمة المرور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="tp-mt-1 tp-block tp-w-full tp-rounded-lg tp-border tp-border-gray-300 tp-px-3 tp-py-2 tp-focus-outline-none tp-focus-ring-2 tp-focus-ring-blue-500"
            />
          </div>
          {state && !state.success && (
            <p role="alert" className="tp-text-sm tp-text-red-600 tp-text-center tp-bg-red-50 tp-rounded-lg tp-px-3 tp-py-2">{state.error}</p>
          )}
          <button
            type="submit"
            disabled={isPending}
            className="tp-w-full tp-py-2 tp-px-4 tp-bg-blue-600 tp-text-white tp-rounded-lg tp-font-medium tp-hover-bg-blue-700 tp-disabled-opacity-50"
          >
            {isPending ? "جاري تسجيل الدخول…" : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </main>
  );
}
