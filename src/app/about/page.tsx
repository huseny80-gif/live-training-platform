import { brand } from "@/lib/brand";
export default function AboutPage() {
  return <main className="platform-content"><h1>من نحن</h1><section className="brand-card tp-p-4 tp-space-y-3">
    <h2>{brand.nameAr}</h2><p>{brand.taglineAr}</p><p>المدرب: <bdi>{brand.trainerName}</bdi></p>
    <p>منصة لإدارة البرامج التدريبية، واستخراج محتوى المستندات، وإعداد الأسئلة ومراجعتها، وتنفيذ الجلسات التفاعلية ومتابعة النتائج.</p>
    <p>تساعد المدرب على ربط الأسئلة بمصادرها، ومشاركة الجلسات مع المتدربين، وتجهيز اختبارات Google Forms من الأسئلة المحفوظة.</p>
  </section></main>;
}
