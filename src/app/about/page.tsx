import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditAbout } from "@/lib/about-permissions";
import { readAbout } from "@/lib/about-store";

export const dynamic = "force-dynamic";

function Points({ text }: { text: string }) {
  return <ul className="about-list">{text.split("\n").map(line => line.trim()).filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}</ul>;
}
export default async function AboutPage() {
  const { content: c } = await readAbout();
  const session = await auth();
  const account = session?.user?.id ? await prisma.instructor.findUnique({ where: { id: session.user.id }, select: { role: true, email: true, isActive: true } }) : null;
  const sections = [["الهدف من المنصة", c.goals], ["الفئة المستهدفة", c.audience], ["طبيعة المحتوى", c.content], ["أهداف التعلم", c.learning], ["طريقة تنظيم المواد", c.organization]];
  return <main className="platform-content about-page"><div className="tp-flex tp-flex-wrap tp-items-center tp-justify-between tp-gap-3"><h1>من نحن</h1>{canEditAbout(account) && <Link href="/about/edit" className="brand-btn brand-btn-secondary">تعديل معلومات من نحن</Link>}</div>
    <section className="brand-card tp-p-4 tp-space-y-3"><h2>{c.title}</h2><p className="about-prose">{c.introduction}</p><Points text={c.programs}/></section>
    <section className="brand-card tp-p-4 tp-space-y-3"><h2>إعداد وتنظيم</h2><div className="about-profile">
      {c.photoUrl && <img className="about-photo" src={c.photoUrl} alt={`الصورة الشخصية — ${c.name}`} width={160} height={192}/>}
      <div className="tp-space-y-3"><h3>{c.name}{c.jobTitle && ` / ${c.jobTitle}`}</h3><strong>{c.responsibility}</strong><p><b>المؤهل العلمي: </b>{c.qualification}</p><p><b>جهة العمل: </b>{c.workplace}</p><p className="about-prose">{c.biography}</p></div>
    </div></section>
    {sections.filter(([, text]) => text.trim()).map(([title, text]) => <section className="brand-card tp-p-4 tp-space-y-3" key={title}><h2>{title}</h2><Points text={text}/></section>)}
    {c.archiveUrl && <section className="brand-card tp-p-4 tp-space-y-3"><h2>مصادر إثرائية</h2><p className="about-prose">{c.archiveDescription}</p><a className="brand-btn brand-btn-secondary" href={c.archiveUrl} target="_blank" rel="noopener noreferrer">{c.archiveTitle || "فتح الأرشيف"}</a></section>}
    {c.notice && <aside className="about-notice about-prose">{c.notice}</aside>}
    <section className="brand-card tp-p-4 tp-space-y-3"><h2>تواصل معنا</h2><div className="about-contacts">
      {c.phone && <a className="brand-btn brand-btn-secondary" href={`tel:${c.phone}`}>اتصال مباشر <bdi>{c.phone}</bdi></a>}
      {c.whatsapp && <a className="brand-btn brand-btn-secondary" href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noopener noreferrer">واتساب <bdi>{c.whatsapp}</bdi></a>}
      {c.email && <a className="brand-btn brand-btn-secondary" href={`mailto:${c.email}`}>البريد الإلكتروني <bdi>{c.email}</bdi></a>}
      {[["تيليجرام", c.telegram], ["لينكدإن", c.linkedin], ["فيسبوك", c.facebook]].map(([label, url]) => url ? <a key={label} className="brand-btn brand-btn-secondary" href={url} target="_blank" rel="noopener noreferrer">{label}</a> : <span key={label}>{label} — ستُفعّل هذه الوسيلة قريباً</span>)}
    </div></section>
  </main>;
}
