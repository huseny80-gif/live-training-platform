"use server";

import { signIn } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { AuthError } from "next-auth";

export type LoginResult =
  | { success: true }
  | { success: false; error: string; retryAfterMs?: number };

export async function loginAction(
  _prev: LoginResult | null,
  formData: FormData
): Promise<LoginResult> {
  const hdrs = await headers();
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown";

  const email = formData.get("email")?.toString() ?? "";
  const rateLimitKey = `login:${ip}:${email}`;
  const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey);

  if (!allowed) {
    const minutes = Math.ceil(retryAfterMs / 60000);
    return {
      success: false,
      error: `محاولات دخول كثيرة. حاول مجدداً بعد ${minutes} دقيقة.`,
      retryAfterMs,
    };
  }

  try {
    await signIn("credentials", {
      email,
      password: formData.get("password")?.toString() ?? "",
      redirect: false,
    });
    return { success: true };
  } catch (err) {
    if (err instanceof AuthError) {
      return { success: false, error: "البريد الإلكتروني أو كلمة المرور غير صحيحة." };
    }
    throw err;
  }
}
