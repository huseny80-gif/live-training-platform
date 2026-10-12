import { compileCatalogSelection, type GroundedCatalog } from "./catalog";
import type { SourcePage } from "./grounding";

/** Source-only recovery is extractive and labelled; it never claims AI analysis. */
export function selectFromSource(pages: SourcePage[], catalog: GroundedCatalog, count: number) {
  const documents = [...new Set(pages.map(p => p.documentId))];
  const selected: GroundedCatalog["questions"] = [];
  const usedSpans = new Set<string>();
  const usedAnswers = new Set<string>();
  function take(question: GroundedCatalog["questions"][number]) {
    if (selected.length >= count || usedSpans.has(question.span.id) || usedAnswers.has(question.answer.toLowerCase())) return;
    selected.push(question); usedSpans.add(question.span.id); usedAnswers.add(question.answer.toLowerCase());
  }
  for (const document of documents) {
    const question = catalog.questions.find(q => q.documentId === document && !usedAnswers.has(q.answer.toLowerCase()));
    if (!question) throw new Error("INSUFFICIENT_SOURCE");
    take(question);
  }
  // Spread selection over pages before taking further questions from the same page.
  const perPage = new Map<string, GroundedCatalog["questions"]>();
  for (const q of catalog.questions) perPage.set(q.span.pageId, [...(perPage.get(q.span.pageId) ?? []), q]);
  for (let round = 0; round < catalog.questions.length && selected.length < count; round++) {
    let found = false;
    for (const list of perPage.values()) { const q = list[round]; if (q) { found = true; take(q); } }
    if (!found) break;
  }
  if (selected.length !== count) throw new Error("INSUFFICIENT_SOURCE");
  const summary = new Set<string>();
  for (const doc of documents) {
    const source = catalog.sources.find(s => s.documentId === doc);
    if (!source) throw new Error("INSUFFICIENT_SOURCE");
    summary.add(source.id);
  }
  for (const q of selected) { if (summary.size >= 18) break; summary.add(q.sourceId); }
  for (const s of catalog.sources) { if (summary.size >= Math.max(3, Math.min(18, selected.length))) break; summary.add(s.id); }
  const guide = selected.slice(0, 8);
  // Try different verified pairs if repeated slide headings cannot form 3 distinct map labels.
  for (const first of catalog.questions.slice(0, 30)) {
    for (const second of catalog.questions.slice(0, 30)) {
      if (first.id === second.id || new Set([first.answer, first.secondary, second.answer, second.secondary]).size < 3) continue;
      return compileCatalogSelection({ summary: [...summary], questions: selected.map(q => q.id), map: [first.id, second.id],
        debrief: (guide.length >= 2 ? guide : [first, second]).map(q => ({ questionId: q.id, kind: "EXPLAIN" })) }, pages, catalog, count, "SOURCE_ONLY");
    }
  }
  throw new Error("INSUFFICIENT_SOURCE");
}
