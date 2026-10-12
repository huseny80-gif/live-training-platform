import Link from "next/link";
import { notFound } from "next/navigation";
import { publishedMaterial } from "@/lib/exam-material/service";
import type { Material, SourcePage, Citation } from "@/lib/exam-material/grounding";
import { sha } from "@/lib/exam-material/grounding";
import { formatTimestamp, videoAtTime } from "@/lib/exam-material/timestamps";
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
  const video = page.sourceKind === "VIDEO";
  const videoLink = video && page.mediaUrl ? videoAtTime(page.mediaUrl, page.startSeconds ?? 0) : null;
  return <main className="em-page" dir="rtl" lang="ar"><div className="em-container em-stack"><Link href={`/study/${token}`}>→ العودة للمادة الامتحانية</Link><h1>{page.fileName}</h1><p>{video ? `التوقيت ${formatTimestamp(page.startSeconds)}–${formatTimestamp(page.endSeconds)}` : `صفحة ${page.pageNumber}`} · أسطر النص {reference.lineStart}–{reference.lineEnd}</p><p className="em-muted">{video ? "هذا نص المقطع المؤقت كما راجعه المدرب وحُفظ عند التوليد." : "هذا نص المصدر المحفوظ عند التوليد. الأسطر تشير إلى النص المستخرج وقد تختلف عن تنسيق أسطر PDF."}</p>{videoLink && <a href={videoLink} target="_blank" rel="noreferrer">فتح المقطع في الفيديو ←</a>}<section className="em-glass em-pad em-source">{lines}</section></div></main>;
}
