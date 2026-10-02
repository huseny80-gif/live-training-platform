import PlatformLogo from "@/components/platform/PlatformLogo";
import { prisma } from "@/lib/prisma";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listOwnedPrograms } from "@/app/actions/programs";
import Link from "next/link";
import { brand } from "@/lib/brand";

const PROGRAM_COVERS = {
  survey: "/program-covers/survey-program.webp",
  gis: "/program-covers/gis-program.webp",
} as const;

function programCover(title: string) {
  const normalized = title.toLowerCase();
  if (normalized.includes("الجغرافية") || normalized.includes("gis")) {
    return { src: PROGRAM_COVERS.gis, kind: "gis" as const, subtitle: "Geographic Information Systems - Level 1" };
  }
  if (normalized.includes("المساحة") || normalized.includes("seismic") || normalized.includes("survey")) {
    return { src: PROGRAM_COVERS.survey, kind: "survey" as const, subtitle: "Positioning on a Land Seismic Crews" };
  }
  return null;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "مسودة",
  ACTIVE: "نشط",
  ARCHIVED: "مؤرشف",
};

const navItems = [
  { label: "الرئيسية", icon: "⌂", href: "/dashboard", active: true },
  { label: "البرامج التدريبية", icon: "▣", href: "#programs" },
  { label: "الجلسات والنتائج", icon: "◉", href: "#sessions" },
  { label: "الأسئلة النهائية", icon: "✓", href: "/final-exam" },
  { label: "مولد Google Forms", icon: "▤", href: "/google-forms" },
  { label: "من نحن", icon: "ⓘ", href: "/about" },
  { label: "الإعدادات", icon: "⚙", href: "/settings" },
  { label: "إنشاء برنامج", icon: "+", href: "/programs/new" },
];
async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

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
  const account = await prisma.instructor.findUnique({ where: { id: session.user.id }, select: { name: true } });
  const displayName = account?.name ?? session.user.name ?? session.user.email ?? "المدرب";

  return (
    <main className="dlp-shell">
      <header className="dlp-header">
        <div className="dlp-header-inner">
          <div className="dlp-brand">
            <PlatformLogo />
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
            <form action={logout}><button type="submit" className="tp-header-signout">تسجيل الخروج</button></form>
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
            action={logout}
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
                  <Link key={p.id} href={`/programs/${p.id}`} className="dlp-program-showcase">
                    {(() => {
                      const cover = programCover(p.title);
                      return cover ? (
                        <div className={`dlp-program-cover ${cover.kind}`}>
                          <img src={cover.src} alt={`واجهة البرنامج التدريبي — ${p.title}`} />
                          <span className="dlp-cover-shade" aria-hidden="true" />
                          <span className="dlp-cover-icon" aria-hidden="true">{cover.kind === "gis" ? "◎" : "⌖"}</span>
                        </div>
                      ) : <div className="dlp-program-cover fallback"><PlatformLogo /></div>;
                    })()}
                    <div className="dlp-program-body">
                      <div className="dlp-program-heading">
                        <div>
                          <div className="dlp-badges">
                            <span className={`dlp-badge ${p.status === "ACTIVE" ? "active" : p.status === "DRAFT" ? "draft" : "archived"}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                            <span className="dlp-language">{p.language === "AR" ? "العربية" : "الإنجليزية"}</span>
                          </div>
                          <h3>{p.title}</h3>
                          {programCover(p.title)?.subtitle && <p className="dlp-program-subtitle">{programCover(p.title)?.subtitle}</p>}
                        </div>
                      </div>
                      {p.description ? <p className="dlp-description">{p.description}</p> : <p className="dlp-description">برنامج تدريبي تطبيقي منظم يجمع المحتوى العلمي والأنشطة والأسئلة التفاعلية.</p>}
                      <div className="dlp-program-metrics">
                        <span><b>{p._count.days}</b><small>أيام تدريبية</small></span>
                        <span><b>{qCount}</b><small>أسئلة تفاعلية</small></span>
                        <span><b>{p._count.sessions}</b><small>جلسات</small></span>
                      </div>
                      <span className="dlp-program-enter">الدخول إلى البرنامج <b aria-hidden="true">←</b></span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <section id="sessions" className="tp-session-directory">
            <h2>الجلسات والنتائج</h2>
            <p>اختر البرنامج لفتح جلساته ومتابعة المشاركين والنتائج.</p>
            <div className="dlp-program-grid">
              {programs.filter((p) => p._count.sessions > 0).map((p) => (
                <Link key={p.id} href={`/programs/${p.id}#sessions`} className="brand-card dlp-program">
                  <strong>{p.title}</strong><p className="dlp-description">{p._count.sessions} جلسة · عرض الجلسات والنتائج ←</p>
                </Link>
              ))}
            </div>
            {totalSessions === 0 && <p className="brand-card dlp-empty">لا توجد جلسات بعد. افتح برنامجاً واختر يوماً لإنشاء جلسة.</p>}
          </section>
          <nav className="dlp-mobile-nav" aria-label="التنقل الرئيسي">
            <Link href="/dashboard" className="active">⌂<span>الرئيسية</span></Link>
            <Link href="#programs">▣<span>البرامج</span></Link>
            <Link href="#sessions">◉<span>الجلسات</span></Link>
            <Link href="/programs/new">+<span>برنامج جديد</span></Link>
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
