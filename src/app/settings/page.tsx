import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import { brand } from "@/lib/brand";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <main className="dlp-simple-page">
    <div className="dlp-simple-header"><Link href="/dashboard">← العودة للرئيسية</Link><strong>{brand.nameAr}</strong></div>
    <section className="brand-card dlp-settings-card">
      <h1>الإعدادات</h1>
      <p>تخصيص اللغة والمظهر والهوية البصرية للحقيبة التدريبية.</p>
      <div className="dlp-setting-row"><div><strong>لغة الواجهة</strong><small>العربية هي اللغة الافتراضية ويمكن التبديل إلى الإنجليزية.</small></div><LanguageToggle /></div>
      <div className="dlp-setting-row"><div><strong>اتجاه الواجهة</strong><small>RTL للعربية وLTR للإنجليزية تلقائياً.</small></div><span>تلقائي</span></div>
      <div className="dlp-setting-row"><div><strong>الهوية</strong><small>تركوازي، كحلي، أبيض ولمسات ذهبية.</small></div><span>{brand.nameEn}</span></div>
    </section>
  </main>;
}
