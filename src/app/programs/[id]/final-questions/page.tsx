import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import FinalQuestionsClient from "./FinalQuestionsClient";
import { brand } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function FinalQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main dir="rtl" lang="ar" className="dlp-simple-page">
      <header className="dlp-program-header">
        <div>
          <Link href={`/programs/${id}`}>← البرنامج التدريبي</Link>
          <strong>{brand.nameAr}</strong>
        </div>
      </header>

      <div className="dlp-final-intro">
        <h1>الأسئلة النهائية</h1>
        <p>
          إنشاء ملخص شامل للمادة ثم 10 أسئلة اختيار من متعدد و20 سؤال صح/خطأ
          اعتمادًا على الصفحات المستخرجة من الملف التدريبي فقط.
        </p>
      </div>

      <FinalQuestionsClient programId={id} />
    </main>
  );
}
