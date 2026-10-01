import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import AppearanceSettings from "./AppearanceSettings";
import { brand } from "@/lib/brand";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div>
          <Link href="/dashboard">← الرئيسية</Link>
          <span>/</span>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="dlp-settings-wrap">
        <AppearanceSettings />

        <section className="brand-card dlp-settings-card">
          <h2>حول النظام</h2>
          <div className="dlp-setting-row">
            <div>
              <strong>المدرب</strong>
              <small>الهوية المعروضة في الحقيبة والتقارير</small>
            </div>
            <b dir="ltr">{brand.instructorName}</b>
          </div>
          <div className="dlp-setting-row">
            <div>
              <strong>المنصة</strong>
              <small>إدارة التدريب المباشر والاختبارات التفاعلية</small>
            </div>
            <b>{brand.nameAr}</b>
          </div>
        </section>
      </div>
    </main>
  );
}
