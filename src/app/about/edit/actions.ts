"use server";
import { auth } from "@/lib/auth";
import { saveAboutContent } from "@/lib/about-store";
import { revalidatePath } from "next/cache";

export async function updateAbout(form: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "انتهت جلسة الدخول. سجّل الدخول مجدداً." };
  try {
    const result = await saveAboutContent(session.user.id, form);
    if (result.ok) { revalidatePath("/about"); revalidatePath("/about/edit"); }
    return result;
  } catch { return { ok: false as const, error: "تعذّر الحفظ. تحقق من الاتصال ثم حدّث الصفحة وأعد المحاولة." }; }
}
