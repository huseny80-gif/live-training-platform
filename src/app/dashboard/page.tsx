import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listOwnedPrograms } from "@/app/actions/programs";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { brandAssets } from "@/lib/brand-assets";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  ARCHIVED: "مؤرشف",
};

const navItems = [
  { label: "الرئيسية", icon: "⌂", href: "/dashboard", active: true },
  { label: "البرامج التدريبية", icon: "▣", href: "/dashboard#programs" },
  { label: "من نحن", icon: "ⓘ", href: "/about" },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const programs = await listOwnedPrograms();
  const totalDays = programs.reduce((s, p) => s + p._count.days, 0);
  const totalQuestions = programs.reduce(
    (sum, p) => sum + p.days.reduce((s, d) => s + d._count.questions, 0),
    0
  );
  const totalSessions = programs.reduce((s, p) => s + p._count.sessions, 0);
  const displayName = brand.instructorName;

  return (
    <main className="dlp-shell">
      <header className="dlp-header">
        <div className="dlp-header-inner">
          <div className="dlp-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={brandAssets.logoDataUri}
              alt="شعار الحقيبة التدريبية"
              className="dlp-logo-image"
            />
            <div>
              <h1>{brand.nameAr}</h1>
              <p>{brand.nameEn}</p>
            </div>
          </div>

          <div className="dlp-user">
            <div className="dlp-user-copy">
              <p>مرحباً بك</p>
              <p className="dlp-user-name">{displayName}</p>
            </div>
            <div className="dlp-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
          </div>
        </div>
      </header>

      <div className="dlp-layout">
        <aside className="dlp-sidebar">
          <nav className="dlp-nav">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`dlp-nav-link${item.active ? " active" : ""}`}
              >
                <span className="dlp-nav-icon" aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <form
            className="dlp-signout"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit">↪ تسجيل الخروج</button>
          </form>
        </aside>

        <section className="dlp-content">
          <div className="dlp-hero">
            <p className="dlp-hero-eyebrow">الحقيبة التدريبية الرقمية</p>
            <h2>إدارة التدريب المباشر والاختبارات التفاعلية من مكان واحد</h2>
            <p className="dlp-hero-desc">
              أنشئ برنامجك التدريبي، جهّز الأسئلة، افتح جلسة مباشرة، وشارك رمز QR مع المتدربين.
            </p>
            <div className="dlp-hero-features">
              <span>جلسات مباشرة</span>
              <span>QR للانضمام</span>
              <span>أسئلة تفاعلية</span>
              <span>نتائج وتحليلات</span>
            </div>
            <Link href="/programs/new" className="dlp-hero-action">
              + إنشاء برنامج تدريبي
            </Link>
          </div>

          <div className="dlp-stats">
            <StatCard label="البرامج التدريبية" value={programs.length} icon="▣" />
            <StatCard label="الأيام التدريبية" value={totalDays} icon="◫" />
            <StatCard label="الأسئلة" value={totalQuestions} icon="✓" />
            <StatCard label="الجلسات" value={totalSessions} icon="◉" />
          </div>

          <div id="programs" className="dlp-section-head">
            <div>
              <h2>البرامج التدريبية</h2>
              <p>اختر برنامجاً لإدارة المحتوى والجلسات والأسئلة.</p>
            </div>
            <Link href="/programs/new" className="brand-button-primary brand-focus dlp-new-button">
              + برنامج جديد
            </Link>
          </div>

          {programs.length === 0 ? (
            <div className="brand-card dlp-empty">
              لا توجد برامج بعد. أنشئ برنامجك التدريبي الأول.
            </div>
          ) : (
            <div className="dlp-program-grid">
              {programs.map((p) => {
                const qCount = p.days.reduce((s, d) => s + d._count.questions, 0);
                return (
                  <Link key={p.id} href={`/programs/${p.id}`} className="brand-card dlp-program">
                    <div className="dlp-program-top">
                      <div>
                        <div className="dlp-badges">
                          <span className="dlp-program-title">{p.title}</span>
                          <span className={`dlp-badge ${
                            p.status === "ACTIVE" ? "active" : p.status === "DRAFT" ? "draft" : "archived"
                          }`}>
                            {STATUS_LABEL[p.status] ?? p.status}
                          </span>
                          <span className="dlp-language">{p.language === "AR" ? "العربية" : "English"}</span>
                        </div>
                        {p.description ? <p className="dlp-description">{p.description}</p> : null}
                      </div>
                      <span className="dlp-arrow">←</span>
                    </div>

                    <div className="dlp-program-meta">
                      <span>{p._count.days} يوم</span>
                      <span>{qCount} سؤال</span>
                      <span>{p._count.sessions} جلسة</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <nav className="dlp-mobile-nav" aria-label="التنقل الرئيسي">
            <Link href="/dashboard" className="active">⌂<span>الرئيسية</span></Link>
            <Link href="/dashboard#programs">▣<span>البرامج</span></Link>
            <Link href="/about">ⓘ<span>من نحن</span></Link>
            <Link href="/programs/new">＋<span>برنامج جديد</span></Link>
          </nav>
          <div className="dlp-mobile-spacer" />
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="brand-card dlp-stat">
      <div className="dlp-stat-icon">{icon}</div>
      <p className="dlp-stat-value">{value}</p>
      <p className="dlp-stat-label">{label}</p>
    </div>
  );
}
