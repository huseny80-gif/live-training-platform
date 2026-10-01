"use client";

import { useActionState } from "react";
import { useParams } from "next/navigation";
import { joinSessionAction } from "@/app/actions/sessions";
import { brand } from "@/lib/brand";

const ERROR_MESSAGES: Record<string, string> = {
  SESSION_NOT_FOUND: "رمز الجلسة غير موجود. تحقق من الرمز وحاول مجدداً.",
  SESSION_NOT_STARTED: "لم يبدأ المدرب الاختبار بعد. انتظر وحاول مجدداً.",
  SESSION_ENDED: "انتهت هذه الجلسة.",
  JOIN_DEADLINE_PASSED: "انتهت فترة الانضمام لهذه الجلسة.",
  INVALID_DISPLAY_NAME: "يجب أن يكون الاسم بين 2 و50 حرفاً.",
  MISSING_FIELDS: "يرجى إدخال الاسم الثلاثي.",
};

type State = { error: string } | null;

export default function JoinWithCodePage() {
  const { code } = useParams<{ code: string }>();
  const normalizedCode = (code ?? "").toUpperCase().slice(0, 6);

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
          <p>أدخل اسمك فقط؛ رمز الجلسة مضمّن في رابط QR.</p>
        </div>

        <form action={action}>
          <div>
            <label htmlFor="join-code-display">رمز الجلسة</label>
            <input
              id="join-code-display"
              name="code"
              required
              readOnly
              value={normalizedCode}
              dir="ltr"
              aria-readonly="true"
            />
          </div>

          <div>
            <label htmlFor="join-name-code">الاسم الثلاثي</label>
            <input
              id="join-name-code"
              name="name"
              required
              autoFocus
              autoComplete="name"
              placeholder="أدخل اسمك الثلاثي"
              minLength={2}
              maxLength={50}
              aria-describedby={errorText ? "join-code-error" : undefined}
            />
          </div>

          {errorText ? <p id="join-code-error" role="alert">{errorText}</p> : null}

          <button type="submit" disabled={isPending}>
            {isPending ? "جارٍ الانضمام…" : "الدخول إلى الجلسة"}
          </button>
        </form>
      </section>
    </main>
  );
}
