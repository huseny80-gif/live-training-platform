"use client";

import { useActionState, useEffect, useState } from "react";
import { brand } from "@/lib/brand";
import { joinSessionAction } from "@/app/actions/sessions";

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND:    "رمز الجلسة غير موجود. تحقق من الرمز وحاول مجدداً.",
  SESSION_NOT_STARTED:  "لم يبدأ المدرب الاختبار بعد. انتظر وحاول مجدداً.",
  SESSION_ENDED:        "انتهت هذه الجلسة.",
  JOIN_DEADLINE_PASSED: "انتهت فترة الانضمام لهذه الجلسة.",
  INVALID_DISPLAY_NAME: "يجب أن يكون الاسم بين 2 و50 حرفاً.",
  MISSING_FIELDS:       "يرجى إدخال رمز الجلسة والاسم الثلاثي.",
};

type State = { error: string } | null;

export default function JoinPage() {
  const [initialCode, setInitialCode] = useState("");
  useEffect(() => {
    const queryCode = new URLSearchParams(window.location.search).get("code");
    const pathCode = window.location.pathname.match(/^\\/join\\/([^/]+)$/)?.[1];
    const code = (queryCode || pathCode || "").trim().toUpperCase();
    if (code) setInitialCode(code.slice(0, 6));
  }, []);

  const [state, action, isPending] = useActionState<State, FormData>(
    async (_prev: State, formData: FormData) => {
      try {
        await joinSessionAction(formData);
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
        if (msg.includes("NEXT_REDIRECT")) throw err;
        return { error: msg };
      }
    },
    null
  );

  const errorText = state?.error
    ? (ERROR_MESSAGES[state.error] ?? `خطأ: ${state.error}`)
    : null;

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <div className="brand-card dlp-join-card">
        <div className="text-center space-y-1">
          <div className="text-4xl mb-2">🎓</div>
          <h1 className="text-2xl font-bold text-gray-900">{brand.nameAr}</h1>
          <p className="text-sm text-gray-500">أدخل رمز الجلسة واسمك للانضمام</p>
        </div>

        <form action={action} className="space-y-4">
          <div>
            <label htmlFor="join-code" className="block text-sm font-medium text-gray-700 mb-1">رمز الجلسة</label>
            <input
              id="join-code"
              name="code"
              value={initialCode}
              onChange={(e) => setInitialCode(e.target.value.toUpperCase())}
              required
              autoComplete="off"
              placeholder="مثال: A3F2B1"
              dir="ltr"
              className="w-full rounded-lg border px-3 py-2.5 text-center font-mono text-lg tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={6}
              aria-describedby={errorText ? "join-error" : undefined}
            />
          </div>

          <div>
            <label htmlFor="join-name" className="block text-sm font-medium text-gray-700 mb-1">الاسم الثلاثي</label>
            <input
              id="join-name"
              name="name"
              required
              autoComplete="name"
              placeholder="أدخل اسمك الثلاثي"
              className="w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              minLength={2}
              maxLength={50}
              aria-describedby={errorText ? "join-error" : undefined}
            />
          </div>

          {errorText && (
            <p id="join-error" role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{errorText}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            aria-disabled={isPending}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? "جاري الانضمام…" : "انضمام للاختبار"}
          </button>
        </form>
      </div>
    </main>
  );
}
