"use client";

import { useActionState, useEffect, useState } from "react";
import { joinSessionAction } from "@/app/actions/sessions";
import { brand } from "@/lib/brand";

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: "رمز الجلسة غير موجود. تحقق من الرمز وحاول مجدداً.",
  SESSION_NOT_STARTED: "لم يبدأ المدرب الاختبار بعد. انتظر وحاول مجدداً.",
  SESSION_ENDED: "انتهت هذه الجلسة.",
  JOIN_DEADLINE_PASSED: "انتهت فترة الانضمام لهذه الجلسة.",
  INVALID_DISPLAY_NAME: "يجب أن يكون الاسم بين 2 و50 حرفاً.",
  MISSING_FIELDS: "يرجى إدخال رمز الجلسة والاسم الثلاثي.",
};

type State = { error: string } | null;

export default function JoinPage() {
  const [initialCode, setInitialCode] = useState("");

  useEffect(() => {
    const queryCode = new URLSearchParams(window.location.search).get("code");
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const pathCode = pathParts[0] === "join" && pathParts[1] ? decodeURIComponent(pathParts[1]) : null;
    const code = (queryCode || pathCode || "").trim().toUpperCase();
    if (code) setInitialCode(code.slice(0, 6));
  }, []);

  const [state, action, isPending] = useActionState<State, FormData>(
    async (_previous, formData) => {
      try {
        await joinSessionAction(formData);
        return null;
      } catch (error) {
        const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
        if (message.includes("NEXT_REDIRECT")) throw error;
        return { error: message };
      }
    },
    null,
  );

  const errorText = state?.error ? (ERROR_MESSAGES[state.error] ?? "تعذر الانضمام إلى الجلسة.") : null;

  return (
    <main dir="rtl" lang="ar" className="dlp-participant-page">
      <section className="brand-card dlp-join-card">
        <div>
          <div className="dlp-state-icon" aria-hidden="true">🎓</div>
          <h1>{brand.nameAr}</h1>
          <p>أدخل رمز الجلسة واسمك للانضمام.</p>
        </div>

        <form action={action}>
          <div>
            <label htmlFor="join-code">رمز الجلسة</label>
            <input
              id="join-code"
              name="code"
              value={initialCode}
              onChange={(event) => setInitialCode(event.target.value.toUpperCase())}
              required
              autoComplete="off"
              placeholder="مثال: A3F2B1"
              dir="ltr"
              maxLength={6}
              aria-describedby={errorText ? "join-error" : undefined}
            />
          </div>

          <div>
            <label htmlFor="join-name">الاسم الثلاثي</label>
            <input
              id="join-name"
              name="name"
              required
              autoComplete="name"
              placeholder="أدخل اسمك الثلاثي"
              minLength={2}
              maxLength={50}
              aria-describedby={errorText ? "join-error" : undefined}
            />
          </div>

          {errorText ? <p id="join-error" role="alert">{errorText}</p> : null}

          <button type="submit" disabled={isPending}>
            {isPending ? "جارٍ الانضمام…" : "الانضمام إلى الاختبار"}
          </button>
        </form>
      </section>
    </main>
  );
}
