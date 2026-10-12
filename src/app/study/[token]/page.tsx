import { notFound } from "next/navigation";
import { publicMaterial } from "@/lib/exam-material/service";
import StudyClient from "./StudyClient";
import "@/app/exam-material/exam-material.css";
export const dynamic = "force-dynamic";
export default async function StudyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const material = await publicMaterial(token);
  if (!material) notFound();
  return <main className="em-page" dir="rtl" lang="ar"><div className="em-container em-stack">
    <header className="em-hero"><span className="em-kicker">منصة الحقيبة التدريبية · مساحة المتدرب</span><h1>المادة الامتحانية</h1><p>راجع المقاطع الأصلية، اختبر فهمك، ثم اعرف أين تحتاج إلى مراجعة إضافية.</p></header>
    <StudyClient token={token} content={material.content}/>
  </div></main>;
}
