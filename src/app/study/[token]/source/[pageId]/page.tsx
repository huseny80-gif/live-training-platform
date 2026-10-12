import Link from "next/link";
import { notFound } from "next/navigation";
import { publishedMaterial } from "@/lib/exam-material/service";
import type { Material, SourcePage, Citation } from "@/lib/exam-material/grounding";
import { sha } from "@/lib/exam-material/grounding";
import "@/app/exam-material/exam-material.css";
export const dynamic = "force-dynamic";
export default async function SourcePageView({ params, searchParams }: {
  params: Promise<{ token: string; pageId: string }>; searchParams: Promise<{ citation?: string }>;
}) {
  const { token, pageId } = await params; const { citation } = await searchParams;
  const batch = await publishedMaterial(token);
  if (!batch?.content) notFound();
  const content = batch.content as unknown as Material;
  const references: Citation[] = [...content.summary, ...content.concepts.map(c => c.citation), ...content.links.map(l => l.citation), ...content.questions.flatMap(q => [q.citation, ...q.options.map(o => o.citation)])];
  const reference = references.find(c => c.id === citation && c.pageId === pageId);
  const page = (batch.sources as unknown as SourcePage[]).find(p => p.id === pageId);
  if (!page || !reference || reference.pageHash !== sha(page.text)) notFound();
  let offset = 0;
  const lines = page.text.split("\n").map((line, i) => {
    const start = offset; offset += line.length + 1;
    const left = Math.max(0, reference.start - start); const right = Math.min(line.length, reference.end - start);
    return <div className="em-source-line" id={`L${i + 1}`} key={i}><span className="em-line-number">{i + 1}</span><span>{right > left ? <>{line.slice(0, left)}<mark>{line.slice(left, right)}</mark>{line.slice(right)}</> : line || " "}</span></div>;
  });
  return <main className="em-page" dir="rtl" lang="ar"><div className="em-container em-stack"><Link href={`/study/${token}`}>→ العودة للمادة الامتحانية</Link><h1>{page.fileName}</h1><p>صفحة {page.pageNumber} · أسطر النص المستخرج {reference.lineStart}–{reference.lineEnd}</p><p className="em-muted">هذا نص الصفحة كما استُخرج وحُفظ عند التوليد. الأسطر تشير إلى النص المستخرج وقد تختلف عن تنسيق أسطر PDF.</p><section className="em-glass em-pad em-source">{lines}</section></div></main>;
}
