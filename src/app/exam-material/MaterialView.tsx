import Link from "next/link";
import type { Citation, StudentMaterial } from "@/lib/exam-material/grounding";

export function CitationView({ citation, token }: { citation: Citation; token?: string | null }) {
  const label = `${citation.extractionMethod === "TESSERACT_OCR" ? "نص OCR · " : ""}${citation.fileName} · صفحة ${citation.pageNumber} · أسطر النص ${citation.lineStart}–${citation.lineEnd}`;
  return <details className="em-citation"><summary>{label}</summary>
    <blockquote>{citation.text}</blockquote>
    {token && <Link href={`/study/${token}/source/${citation.pageId}?citation=${encodeURIComponent(citation.id)}#L${citation.lineStart}`}>مراجعة الفقرة في المحاضرة ←</Link>}
  </details>;
}
export function SummaryView({ content, token }: { content: StudentMaterial; token?: string | null }) {
  return <section aria-label="الملخص الحرفي" className="em-stack"><h2>الملخص المستخرج حرفيًا</h2>
    <p className="em-muted">مقاطع مقتبسة من المحاضرات المحددة؛ افتح المرجع لمراجعة موضع كل مقطع.</p>
    {content.summary.map(c => <article className="em-glass em-pad" key={c.id}><blockquote>{c.text}</blockquote><CitationView citation={c} token={token}/></article>)}
  </section>;
}
export function ConceptView({ content, token }: { content: StudentMaterial; token?: string | null }) {
  return <section className="em-stack"><h2>خريطة المفاهيم</h2><p className="em-muted">تربط الخريطة المفاهيم التي وردت معًا في مقطع واحد؛ كل رابط يستند إلى اقتباس، ولا يفترض علاقة سببية.</p>
    <div className="em-concept-grid">{content.concepts.map(c => <article className="em-glass em-pad" id={`concept-${c.id}`} key={c.id}>
      <span className="em-kicker">مفهوم {c.id + 1}</span><h3>{c.label}</h3><CitationView citation={c.citation} token={token}/>
    </article>)}</div>
    <div className="em-links">{content.links.map((link, i) => <article key={i} className="em-glass em-pad">
      <p className="em-map-link"><a href={`#concept-${link.from}`}>{content.concepts[link.from].label}</a><span aria-label="ورد مع">↔</span><a href={`#concept-${link.to}`}>{content.concepts[link.to].label}</a></p>
      <CitationView citation={link.citation} token={token}/>
    </article>)}</div>
  </section>;
}
