import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditAbout } from "@/lib/about-permissions";
import { readAbout } from "@/lib/about-store";

export const dynamic = "force-dynamic";

function Points({ text }: { text: string }) {
  return <ul className="about-list">{text.split("\n").map(line => line.trim()).filter(Boolean).map((line, i) => <li key={i}>{line}</li>)}</ul>;
}

function ContactIcon({ type }: { type: string }) {
  const paths: Record<string, React.ReactNode> = {
    phone: <><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.92z"/></>,
    whatsapp: <><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z"/><path d="M9.2 8.4c.3 2.2 2.1 4 4.3 4.5"/></>,
    email: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
    telegram: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    linkedin: <><rect x="3" y="9" width="4" height="12"/><path d="M5 3v.01"/><path d="M11 21v-7a4 4 0 0 1 8 0v7"/><path d="M11 9v12"/></>,
    facebook: <><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[type]}</svg>;
}

function ContactCard({ type, label, value, href, external = false }: { type: string; label: string; value?: string; href?: string; external?: boolean }) {
  const inner = <><span className="about-contact-icon"><ContactIcon type={type}/></span><span className="about-contact-copy"><strong>{label}</strong><small><bdi>{value || "ستُفعّل هذه الوسيلة قريباً"}</bdi></small></span>{href && <span className="about-contact-arrow" aria-hidden="true">↗</span>}</>;
  return href
    ? <a className="about-contact-card" href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>{inner}</a>
    : <div className="about-contact-card is-disabled">{inner}</div>;
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
    <section className="about-contact-section">
      <div className="about-contact-orb about-contact-orb-one" aria-hidden="true"/>
      <div className="about-contact-orb about-contact-orb-two" aria-hidden="true"/>
      <div className="about-contact-heading">
        <span className="about-contact-heading-icon"><ContactIcon type="email"/></span>
        <div><span className="about-contact-kicker">نحن قريبون منك</span><h2>تواصل معنا</h2><p>نسعد بتواصلكم وملاحظاتكم ومقترحاتكم لتطوير المحتوى والتجربة التدريبية.</p></div>
      </div>
      <div className="about-contacts">
        {c.phone && <ContactCard type="phone" label="اتصال مباشر" value={c.phone} href={`tel:${c.phone}`}/>}
        {c.whatsapp && <ContactCard type="whatsapp" label="واتساب" value={c.whatsapp} href={`https://wa.me/${c.whatsapp}`} external/>}
        {c.email && <ContactCard type="email" label="البريد الإلكتروني" value={c.email} href={`mailto:${c.email}`}/>}
        <ContactCard type="telegram" label="تيليجرام" value={c.telegram || undefined} href={c.telegram || undefined} external={Boolean(c.telegram)}/>
        <ContactCard type="linkedin" label="لينكدإن" value={c.linkedin || undefined} href={c.linkedin || undefined} external={Boolean(c.linkedin)}/>
        <ContactCard type="facebook" label="فيسبوك" value={c.facebook || undefined} href={c.facebook || undefined} external={Boolean(c.facebook)}/>
      </div>
      <div className="about-contact-signature"><img src="/training-logo.webp" alt="" width={44} height={44}/><span><strong>{c.name || "Eng. Husen Yasen"}</strong><small>{c.responsibility || "إعداد وتنظيم المحتوى وبناء المنصة"}</small></span></div>
    </section>
  </main>;
}
