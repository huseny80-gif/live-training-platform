import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listOwnedPrograms } from "@/app/actions/programs";
import Link from "next/link";
import { brand } from "@/lib/brand";
import LanguageToggle from "@/components/LanguageToggle";
import PlatformTheme from "@/components/PlatformTheme";
import { getPlatformSettings } from "@/app/actions/platform-settings";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  ARCHIVED: "مؤرشف",
};

const STATUS_COLOR: Record<string, string> = {
  DRAFT: "bg-amber-50 text-amber-700",
  ACTIVE: "bg-emerald-50 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-600",
};

const navItems = [
  { label: "الرئيسية", icon: "⌂", href: "/dashboard", active: true },
  { label: "البرامج التدريبية", icon: "▣", href: "/dashboard" },
  { label: "الجلسات المباشرة", icon: "◉", href: "/dashboard" },
  { label: "المشاركون", icon: "♙", href: "/dashboard" },
  { label: "الاختبارات", icon: "✓", href: "/dashboard" },
  { label: "النتائج والتحليلات", icon: "⌁", href: "/dashboard" },
  { label: "الإعدادات", icon: "⚙", href: "/settings" },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const programs = await listOwnedPrograms();
  const settings = await getPlatformSettings();
  const totalDays = programs.reduce((s, p) => s + p._count.days, 0);
  const totalQuestions = programs.reduce(
    (sum, p) => sum + p.days.reduce((s, d) => s + d._count.questions, 0),
    0
  );
  const totalSessions = programs.reduce((s, p) => s + p._count.sessions, 0);
  const displayName = session.user.name ?? session.user.email ?? "المدرب";

  return (
    <main className="dlp-shell" style={{ fontFamily: brand.typography.arabic }}>
      <header className="dlp-header">
        <div className="dlp-header-inner">
          <div className="dlp-brand">
            <div className="dlp-logo">ق</div>
            <div>
              <h1 >{settings.platformNameAr}</h1>
              <p >{settings.platformNameEn}</p>
            </div>
          </div>
          <LanguageToggle />
          <div className="dlp-user">
            <div className="dlp-user-copy">
              <p >مرحباً بك</p>
              <p className="dlp-user-name">{displayName}</p>
            </div>
            <div className="dlp-avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
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
            <button type="submit" >
              ↪ تسجيل الخروج
            </button>
          </form>
        </aside>

        <section className="dlp-content">
          <div className="dlp-hero">
            <p className="dlp-hero-eyebrow">مرحباً بك في منصة</p>
            <h2 >{brand.nameAr}</h2>
            <p className="dlp-hero-desc">{settings.taglineAr}</p>
            <Link href="/programs/new" className="dlp-hero-action">
              + إنشاء برنامج تدريبي
            </Link>
          </div>

          <div className="dlp-stats">
            <StatCard label="البرامج التدريبية" value={programs.length} icon="▣" />
            <StatCard label="الأيام التدريبية" value={totalDays} icon="◫" />
            <StatCard label="الاختبارات والأسئلة" value={totalQuestions} icon="✓" />
            <StatCard label="الجلسات" value={totalSessions} icon="◉" />
          </div>

          <div className="dlp-section-head">
            <div>
              <h2 >البرامج التدريبية</h2>
              <p >إدارة البرامج والأيام والجلسات والأسئلة من مكان واحد</p>
            </div>
            <Link href="/programs/new" className="brand-button-primary brand-focus dlp-new-button">
              + برنامج جديد
            </Link>
          </div>

          {programs.length === 0 ? (
            <div className="brand-card dlp-empty">لا توجد برامج بعد. أنشئ برنامجك التدريبي الأول.</div>
          ) : (
            <div className="dlp-program-grid">
              {programs.map((p) => {
                const qCount = p.days.reduce((s, d) => s + d._count.questions, 0);
                return (
                  <Link key={p.id} href={`/programs/${p.id}`} className="brand-card dlp-program">
                    <div className="dlp-program-top">
                      <div >
                        <div className="dlp-badges">
                          <span className="dlp-program-title">{p.title}</span>
                          <span className={`dlp-badge ${p.status === "ACTIVE" ? "active" : p.status === "DRAFT" ? "draft" : "archived"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                          <span className="dlp-language">{p.language}</span>
                        </div>
                        {p.description && <p className="dlp-description">{p.description}</p>}
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
            <Link href="/dashboard" className="active">⌂<span className="block">الرئيسية</span></Link>
            <Link href="/dashboard" >▣<span className="block">البرامج</span></Link>
            <Link href="/dashboard" >◉<span className="block">الجلسات</span></Link>
            <Link href="/settings" >⚙<span className="block">الإعدادات</span></Link>
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
