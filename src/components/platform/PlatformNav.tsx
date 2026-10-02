import Link from "next/link";
import { brand } from "@/lib/brand";
export default function PlatformNav() {
  return <header className="platform-bar">
    <Link href="/dashboard" className="platform-identity" aria-label={brand.nameAr}>
      <svg viewBox="0 0 48 48" width="42" height="42" role="img" aria-label="شعار المنصة"><rect width="48" height="48" rx="12" fill="#0F766E"/><path d="M9 17l15-7 15 7-15 7zM14 24v9c6 5 14 5 20 0v-9M39 18v14" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinejoin="round"/></svg>
      <span><strong>{brand.nameAr}</strong><small>{brand.nameEn}</small></span>
    </Link>
    <nav aria-label="أقسام المنصة">
      <Link href="/dashboard">لوحة المدرب</Link><Link href="/final-exam">الأسئلة النهائية</Link>
      <Link href="/questions">مراجعة الأسئلة</Link><Link href="/google-forms">مولد Google Forms</Link><Link href="/about">من نحن</Link>
      <Link href="/settings">⚙ الإعدادات</Link>
    </nav>
  </header>;
}
