"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import PlatformLogo from "./PlatformLogo";
import { brand } from "@/lib/brand";
export default function PlatformNav({ isInstructor = false }: { isInstructor?: boolean }) {
  const pathname = usePathname();
  if (/^\/(join|session)(\/|$)/.test(pathname)) return null;
  return <header className="platform-bar">
    <Link href={isInstructor ? "/dashboard" : "/about"} className="platform-identity" aria-label={brand.nameAr}>
      <PlatformLogo />
      <span><strong>{brand.nameAr}</strong><small>{brand.nameEn}</small></span>
    </Link>
    <nav aria-label="أقسام المنصة">
      {isInstructor && <><Link href="/dashboard">لوحة المدرب</Link><Link href="/final-exam">الأسئلة النهائية</Link>
      <Link href="/questions">مراجعة الأسئلة</Link><Link href="/google-forms">مولد Google Forms</Link><Link href="/settings">⚙ الإعدادات</Link></>}
      <Link href="/about">من نحن</Link>
    </nav>
  </header>;
}
