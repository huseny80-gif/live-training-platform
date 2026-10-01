import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const displayName = session.user.name ?? "مدير الحقيبة التدريبية";
  const email = session.user.email ?? null;

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div>
          <Link href="/dashboard">← الرئيسية</Link>
          <strong>من نحن</strong>
        </div>
      </header>

      <div className="dlp-program-container">
        <section className="brand-card dlp-program-section">
          <h1>من نحن</h1>
          <p>
            {brand.nameAr} منصة مستقلة لإدارة التدريب المباشر والاختبارات التفاعلية،
            من إعداد المحتوى إلى جلسات QR والنتائج والتحليلات.
          </p>

          <div className="dlp-about-preview">
            <div className="dlp-about-avatar" aria-hidden>
              {displayName.slice(0, 1)}
            </div>

            <div>
              <h2>{displayName}</h2>
              <strong>مدير الحقيبة التدريبية</strong>
              <p>
                إدارة البرامج التدريبية، رفع وتحليل المادة، إنشاء بنك الأسئلة،
                تشغيل الجلسات المباشرة ومتابعة نتائج المشاركين.
              </p>
              {email ? <small dir="ltr">{email}</small> : null}
            </div>
          </div>

          <div className="dlp-stats" style={{ marginTop: 24 }}>
            <div className="brand-card dlp-stat">
              <div className="dlp-stat-icon">QR</div>
              <p className="dlp-stat-label">انضمام مباشر عبر رمز QR</p>
            </div>
            <div className="brand-card dlp-stat">
              <div className="dlp-stat-icon">✓</div>
              <p className="dlp-stat-label">اختبارات تفاعلية عربية</p>
            </div>
            <div className="brand-card dlp-stat">
              <div className="dlp-stat-icon">AI</div>
              <p className="dlp-stat-label">توليد محتوى وأسئلة من المادة</p>
            </div>
            <div className="brand-card dlp-stat">
              <div className="dlp-stat-icon">⌁</div>
              <p className="dlp-stat-label">نتائج وتحليلات وتصدير</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
