"use client";

import { useActionState } from "react";
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

export default function JoinForm({ code = "" }: { code?: string }) {
  const sessionCode = code.trim().toUpperCase();
  const [state, action, isPending] = useActionState<State, FormData>(
    async (_prev, formData) => {
      try {
        await joinSessionAction(formData);
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "UNKNOWN_ERROR";
        if (msg.includes("NEXT_REDIRECT")) throw err;
        return { error: msg };
      }
    }, null
  );
  const errorText = state?.error
    ? ERROR_MESSAGES[state.error] ?? "تعذّر الانضمام. حاول مجدداً أو تواصل مع المدرب."
    : null;

  return (
    <main className="dlp-participant-page">
      <section className="brand-card dlp-join-card">
        <header className="tp-form-heading">
          <div className="tp-brand-mark" aria-hidden="true">ح</div>
          <h1>{brand.nameAr}</h1>
          <p>{sessionCode ? "أدخل اسمك الثلاثي للانضمام إلى الاختبار" : "أدخل رمز الجلسة واسمك الثلاثي للانضمام"}</p>
        </header>
        <form action={action} className="tp-form">
          {sessionCode ? (
            <>
              <input type="hidden" name="code" value={sessionCode} />
              <p className="tp-session-code">رمز الجلسة <strong dir="ltr">{sessionCode}</strong></p>
            </>
          ) : (
            <label htmlFor="join-code">رمز الجلسة
              <input id="join-code" name="code" required autoComplete="off" placeholder="مثال: A3F2B1" dir="ltr" maxLength={6} aria-describedby={errorText ? "join-error" : undefined} />
            </label>
          )}
          <label htmlFor="join-name">الاسم الثلاثي
            <input id="join-name" name="name" required autoFocus={!!sessionCode} autoComplete="name" placeholder="أدخل اسمك الثلاثي" minLength={2} maxLength={50} aria-describedby={errorText ? "join-error" : undefined} />
          </label>
          {errorText && <p id="join-error" role="alert" className="dlp-error">{errorText}</p>}
          <button type="submit" disabled={isPending} className="brand-button-primary brand-focus tp-submit">{isPending ? "جاري الانضمام…" : "انضمام للاختبار"}</button>
        </form>
      </section>
    </main>
  );
}
