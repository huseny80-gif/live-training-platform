import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listOwnedPrograms } from "@/app/actions/programs";
import Link from "next/link";
import { brand } from "@/lib/brand";

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
  const totalDays = programs.reduce((s, p) => s + p._count.days, 0);
  const totalQuestions = programs.reduce(
    (sum, p) => sum + p.days.reduce((s, d) => s + d._count.questions, 0),
    0
  );
  const totalSessions = programs.reduce((s, p) => s + p._count.sessions, 0);
  const displayName = session.user.name ?? session.user.email ?? "المدرب";

  return (
    <main className="min-h-screen bg-[var(--brand-bg)] text-[var(--brand-text)]" style={{ fontFamily: brand.typography.arabic }}>
      <header className="sticky top-0 z-20 border-b border-[var(--brand-border)] bg-[var(--brand-surface)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-3 lg:px-7">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--brand-primary)] text-xl font-black text-white shadow-sm">ق</div>
            <div>
              <h1 className="text-base font-extrabold text-[var(--brand-navy)] sm:text-lg">{brand.nameAr}</h1>
              <p className="hidden text-[11px] text-[var(--brand-muted)] sm:block">{brand.nameEn}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-left sm:block">
              <p className="text-xs text-[var(--brand-muted)]">مرحباً بك</p>
              <p className="max-w-48 truncate text-sm font-bold">{displayName}</p>
            </div>
            <div className="grid h-10 w-10 place-items-center rounded-full border border-[var(--brand-border)] bg-slate-50 font-bold text-[var(--brand-primary-dark)]">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] lg:grid-cols-[240px_1fr]">
        <aside className="hidden min-h-[calc(100vh-69px)] border-l border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 lg:flex lg:flex-col">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  item.active
                    ? "bg-[var(--brand-primary)] text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50 hover:text-[var(--brand-primary-dark)]"
                }`}
              >
                <span className="w-5 text-center text-lg" aria-hidden>{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>
          <form
            className="mt-auto"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button type="submit" className="w-full rounded-xl px-4 py-3 text-right text-sm text-slate-500 hover:bg-slate-50 hover:text-red-600">
              ↪ تسجيل الخروج
            </button>
          </form>
        </aside>

        <section className="min-w-0 p-4 sm:p-6 lg:p-8">
          <div className="overflow-hidden rounded-3xl bg-gradient-to-l from-[var(--brand-navy)] via-[#087f86] to-[var(--brand-primary)] p-6 text-white shadow-lg sm:p-8">
            <p className="mb-2 text-sm text-white/80">مرحباً بك في منصة</p>
            <h2 className="max-w-3xl text-2xl font-black leading-tight sm:text-3xl">{brand.nameAr}</h2>
            <p className="mt-3 max-w-2xl text-sm text-white/80">{brand.taglineAr}</p>
            <Link href="/programs/new" className="mt-6 inline-flex rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[var(--brand-primary-dark)] shadow-sm transition hover:-translate-y-0.5">
              + إنشاء برنامج تدريبي
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="البرامج التدريبية" value={programs.length} icon="▣" />
            <StatCard label="الأيام التدريبية" value={totalDays} icon="◫" />
            <StatCard label="الاختبارات والأسئلة" value={totalQuestions} icon="✓" />
            <StatCard label="الجلسات" value={totalSessions} icon="◉" />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-extrabold text-[var(--brand-navy)]">البرامج التدريبية</h2>
              <p className="mt-1 text-sm text-[var(--brand-muted)]">إدارة البرامج والأيام والجلسات والأسئلة من مكان واحد</p>
            </div>
            <Link href="/programs/new" className="brand-button-primary brand-focus px-4 py-2.5 text-sm font-bold">
              + برنامج جديد
            </Link>
          </div>

          {programs.length === 0 ? (
            <div className="brand-card mt-4 py-16 text-center text-[var(--brand-muted)]">لا توجد برامج بعد. أنشئ برنامجك التدريبي الأول.</div>
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {programs.map((p) => {
                const qCount = p.days.reduce((s, d) => s + d._count.questions, 0);
                return (
                  <Link key={p.id} href={`/programs/${p.id}`} className="brand-card group block p-5 transition hover:-translate-y-0.5 hover:border-[var(--brand-primary)] hover:shadow-[var(--brand-shadow-card)]">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-[var(--brand-navy)] group-hover:text-[var(--brand-primary-dark)]">{p.title}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_COLOR[p.status] ?? ""}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                          <span className="text-xs text-[var(--brand-muted)]">{p.language}</span>
                        </div>
                        {p.description && <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--brand-muted)]">{p.description}</p>}
                      </div>
                      <span className="text-xl text-[var(--brand-primary)]">←</span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--brand-border)] pt-4 text-xs text-[var(--brand-muted)]">
                      <span>{p._count.days} يوم</span>
                      <span>{qCount} سؤال</span>
                      <span>{p._count.sessions} جلسة</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-[var(--brand-border)] bg-white/95 p-2 shadow-xl backdrop-blur lg:hidden" aria-label="التنقل الرئيسي">
            <Link href="/dashboard" className="rounded-xl bg-[var(--brand-primary)] px-2 py-2 text-center text-xs font-bold text-white">⌂<span className="block">الرئيسية</span></Link>
            <Link href="/dashboard" className="px-2 py-2 text-center text-xs text-slate-600">▣<span className="block">البرامج</span></Link>
            <Link href="/dashboard" className="px-2 py-2 text-center text-xs text-slate-600">◉<span className="block">الجلسات</span></Link>
            <Link href="/settings" className="px-2 py-2 text-center text-xs text-slate-600">⚙<span className="block">الإعدادات</span></Link>
          </nav>
          <div className="h-20 lg:hidden" />
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="brand-card p-4 sm:p-5">
      <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-lg font-black text-[var(--brand-primary-dark)]">{icon}</div>
      <p className="text-2xl font-black text-[var(--brand-navy)] sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs text-[var(--brand-muted)] sm:text-sm">{label}</p>
    </div>
  );
}
