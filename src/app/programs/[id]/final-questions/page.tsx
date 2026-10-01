import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import FinalQuestionsClient from "./FinalQuestionsClient";

export default async function FinalQuestionsPage({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  return <main className="dlp-simple-page"><div className="dlp-simple-header"><Link href={`/programs/${id}`}>← البرنامج التدريبي</Link><strong>الأسئلة النهائية</strong></div><div className="dlp-final-intro"><h1>الأسئلة النهائية</h1><p>مراجعة ملف المادة المرفق حصراً، تلخيصه، ثم إنشاء 10 أسئلة MCQ و20 سؤال صح/خطأ مع مراجع الصفحات وكود Google Apps Script.</p></div><FinalQuestionsClient programId={id}/></main>;
}
