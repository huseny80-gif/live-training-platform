import Link from "next/link";
import { canEditAbout } from "@/lib/about-permissions";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { brand } from "@/lib/brand";
import { updateAccountName } from "./actions";
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const account = await prisma.instructor.findUnique({ where: { id: session.user.id }, select: { name: true, email: true, role: true, isActive: true } });
  if (!account) redirect("/login");
  const query = await searchParams;
  return <main className="platform-content"><h1>الإعدادات</h1>
    <section className="brand-card tp-p-4 tp-space-y-3"><h2>معلومات الأدمن والحساب</h2>
      <p>الاسم: {account.name}</p><p>البريد الإلكتروني: <bdi>{account.email}</bdi></p>
      <p>الصلاحية: {account.role === "ADMIN" ? "أدمن" : "مدرب"}</p>
      <form action={updateAccountName} className="tp-space-y-3"><label htmlFor="account-name">اسم العرض</label>
        <input id="account-name" name="name" defaultValue={account.name} minLength={2} maxLength={100} required className="platform-input"/>
        <button className="brand-btn brand-btn-primary" type="submit">حفظ الاسم</button>
      </form>
      {query.saved && <p role="status">تم حفظ الاسم.</p>}{query.error && <p role="alert">أدخل اسماً من حرفين إلى 100 حرف.</p>}
    </section>
    {canEditAbout(account) && <section className="brand-card tp-p-4 tp-space-y-3"><h2>محتوى من نحن</h2><p>عدّل النبذة والصورة والبرامج والأهداف ووسائل التواصل.</p><Link href="/about/edit" className="brand-btn brand-btn-primary">تعديل معلومات من نحن</Link></section>}
    <section className="brand-card tp-p-4 tp-space-y-3"><h2>هوية المنصة</h2><p>المدرب: <bdi>{brand.trainerName}</bdi></p><p>{brand.nameAr} · {brand.nameEn}</p><p>{brand.taglineAr}</p></section>
  </main>;
}
