import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import LanguageToggle from "@/components/LanguageToggle";
import AppearanceSettings from "@/components/AppearanceSettings";
import BrandAdminForm from "./BrandAdminForm";
import { getPlatformSettings } from "@/app/actions/platform-settings";
import { brand } from "@/lib/brand";
export default async function SettingsPage(){const session=await auth();if(!session?.user)redirect("/login");const settings=await getPlatformSettings();return <main className="dlp-simple-page"><div className="dlp-simple-header"><Link href="/dashboard">← العودة للرئيسية</Link><strong>{brand.nameAr}</strong></div><section className="brand-card dlp-settings-card"><h1>إعدادات الواجهة والهوية</h1><p>يمكن تعديل هذه الخيارات مستقبلاً دون إعادة بناء محتوى الحقيبة.</p><div className="dlp-setting-row"><div><strong>لغة الواجهة</strong><small>العربية افتراضياً، مع دعم اتجاه RTL/LTR.</small></div><LanguageToggle/></div><AppearanceSettings/><BrandAdminForm settings={settings}/><div className="dlp-setting-row"><div><strong>الهوية الحالية</strong><small>اسم المنصة المعتمد حالياً.</small></div><span>{brand.nameAr} · {brand.nameEn}</span></div></section></main>}
