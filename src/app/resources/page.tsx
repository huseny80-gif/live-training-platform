import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import { resourceDirectory } from "@/lib/resources/directory";
import ResourceLibrary from "./ResourceLibrary";
import "@/app/exam-material/exam-material.css";
import "./resources.css";
export const dynamic = "force-dynamic";
export default async function ResourcesPage({ searchParams }: { searchParams: Promise<{ programId?: string }> }) {
  const user = await auth(); if (!user?.user?.id) redirect("/login");
  const { programId } = await searchParams;
  const programs = await prisma.trainingProgram.findMany({ where: { instructorId: user.user.id }, select: { id: true, title: true }, orderBy: { createdAt: "desc" } });
  const program = programId ? programs.find(p => p.id === programId) : null; if (programId && !program) notFound();
  const directory = programs.length ? await resourceDirectory(program?.id ?? null, user.user.id) : null;
  return <main className="em-page" dir="rtl" lang="ar"><div className="rl-container em-stack"><Link href="/dashboard">→ لوحة المدرب</Link><nav className="em-tabs" aria-label="برامج المكتبة"><Link className={!program ? "active" : ""} href="/resources">كل البرامج</Link>{programs.map(p => <Link key={p.id} className={p.id === program?.id ? "active" : ""} href={`/resources?programId=${p.id}`}>{p.title}</Link>)}</nav>
    {directory ? <ResourceLibrary key={program?.id ?? "all"} programId={program?.id ?? null} programTitle={program?.title ?? "موارد كل البرامج"} programs={programs} {...directory}/> : <section className="em-glass em-pad"><h1>مكتبة الموارد الرقمية الشاملة</h1><p>أنشئ برنامجًا لإضافة موارده وتنظيمها.</p><Link href="/programs/new">إنشاء برنامج</Link></section>}
  </div></main>;
}
