import type { SourcePage, Span, Material } from "./grounding";

// Normalisation is for detecting repeated furniture only; never used as displayed text.
const lineKey = (text: string) => text.trim().replace(/\s+/gu, " ").toLowerCase();
const courseHeading = /(?:دورة|دوره|course)[^\n]*(?:المستوى|المستوي|level)/iu;
const credit = /(?:إعداد|اعداد|تقديم|المحاضر|المدرب)\s*[:：]/u;
const knownAcronyms = new Set("GIS GPS GPX SQL API DEM DSM DTM CAD UTM WGS ESRI CSV PDF PNG JPG TIFF KML WMS WFS ID OID FID XY X Y Z 3D 2D AI ML NLP IT ICT ERP CRM KPI HR URL HTTP HTTPS ROI".split(" "));

export function sourceQuality(pages: SourcePage[]) {
  const documents = new Map<string, SourcePage[]>();
  for (const page of pages) documents.set(page.documentId, [...(documents.get(page.documentId) ?? []), page]);
  const repeated = new Map<string, Set<string>>();
  for (const [id, docPages] of documents) {
    const occurrences = new Map<string, number>();
    for (const page of docPages) for (const key of new Set(page.text.split("\n").map(lineKey).filter(k => k.length >= 15))) occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
    repeated.set(id, new Set([...occurrences].filter(([, n]) => n >= Math.max(3, Math.ceil(docPages.length / 2))).map(([key]) => key)));
  }
  const pageMap = new Map(pages.map(p => [p.id, p]));
  return (span: Span): string | null => {
    const page = pageMap.get(span.pageId);
    if (!page || page.text.slice(span.start, span.end) !== span.text) return "CHANGED_SOURCE";
    if (span.text.split("\n").some(line => courseHeading.test(line) || credit.test(line) || /Iraqi Oil Exploration Company/iu.test(line) || repeated.get(page.documentId)?.has(lineKey(line)))) return "BOILERPLATE";
    if (/\uFFFD|[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(span.text)) return "ENCODING_NOISE";
    const arabic = span.text.match(/[\u0621-\u064a]+/gu) ?? [];
    const latin = span.text.match(/\b[A-Z]{2,3}\b/g) ?? [];
    if (arabic.length >= 3 && latin.some(word => !knownAcronyms.has(word))) return "SUSPECT_OCR_TOKEN";
    if (page.extractionMethod === "TESSERACT_OCR") {
      if (!page.ocrQuality || page.ocrQuality.version !== 1) return "OCR_QUALITY_MISSING";
      if (page.ocrQuality.uncertainRanges.some(r => r.start < span.end && r.end > span.start)) return "OCR_UNCERTAIN";
    }
    return null;
  };
}

/** Recheck archived drafts on publication too; a legacy draft cannot bypass new checks. */
export function validateMaterialSources(content: Material, pages: SourcePage[]) {
  const check = sourceQuality(pages);
  const refs = [...content.summary, ...content.concepts.map(c => c.citation), ...content.links.map(l => l.citation), ...content.questions.flatMap(q => [q.citation, ...q.options.map(o => o.citation)])];
  if (refs.some(ref => check(ref))) throw new Error("SOURCE_QUALITY_REJECTED");
}
