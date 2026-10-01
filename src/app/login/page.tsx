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
    <main dir="rtl" lang="ar" className="dlp-auth-page">
      <section className="dlp-auth-card">
        <div className="dlp-auth-brand">
          <div className="dlp-logo">ح</div>
          <h1>{brand.nameAr}</h1>
          <p>دخول المدرب إلى لوحة إدارة التدريب المباشر</p>
        </div>

        <form action={dispatch} className="dlp-auth-form">
          <label htmlFor="email">البريد الإلكتروني</label>
          <input id="email" name="email" type="email" required autoComplete="email" dir="ltr" />

          <label htmlFor="password">كلمة المرور</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" dir="ltr" />

          {state && !state.success ? <p role="alert">{state.error}</p> : null}

          <button type="submit" disabled={isPending}>
            {isPending ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
          </button>
        </form>
      </section>
    </main>
  );
}
