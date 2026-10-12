import { z } from "zod";
import { sourceSpans, compileGroundedMaterial, type SourcePage, type Span, type SelectionPlan } from "./grounding";

const stopWords = new Set("في من على إلى عن مع بين هذا هذه هو هي أن أو التي الذي يتم يمكن كما عند بعد قبل the and for with from into this that are was have has of to in is a an".split(" "));
function phrases(text: string) {
  const words = [...text.matchAll(/[\p{L}\p{N}]+/gu)];
  const result: { text: string; score: number }[] = [];
  for (let size = 1; size <= 4; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      const tokens = words.slice(i, i + size);
      const first = tokens[0]; const last = tokens[tokens.length - 1];
      const value = text.slice(first.index!, last.index! + last[0].length);
      const significant = tokens.filter(t => /\p{L}/u.test(t[0]) && t[0].length >= 3 && !stopWords.has(t[0].toLowerCase()));
      if (significant.length < (size === 1 ? 1 : 2) || (size === 1 && first[0].length < 4) || stopWords.has(first[0].toLowerCase()) || stopWords.has(last[0].toLowerCase()) || value.length < 4 || value.length > 100 || value.length > text.length / 2) continue;
      // Prefer short content phrases; retain the exact original spaces and punctuation.
      result.push({ text: value, score: significant.length * 3 - size - Math.abs(value.length - 25) / 20 });
    }
  }
  return result.sort((a, b) => b.score - a.score).filter((p, i, all) => all.findIndex(o => o.text === p.text) === i);
}
export type GroundedCatalog = ReturnType<typeof buildGroundedCatalog>;
export function buildGroundedCatalog(pages: SourcePage[]) {
  const spans = sourceSpans(pages);
  const sources = spans.map((span, i) => ({ id: `S${i + 1}`, span, documentId: pages.find(p => p.id === span.pageId)!.documentId }));
  const phrasesBySpan = new Map(spans.map(span => [span.id, phrases(span.text)]));
  const candidates = spans.flatMap(span => (phrasesBySpan.get(span.id) ?? []).slice(0, 5).map(p => ({ spanId: span.id, text: p.text })));
  const pool = [...new Map(candidates.map(p => [p.text.toLowerCase(), { ...p, folded: p.text.toLowerCase() }])).values()];
  const answerUsage = new Map<string, number>();
  const questions: { id: string; sourceId: string; documentId: string; span: Span; answer: string; secondary: string; distractors: { spanId: string; text: string }[] }[] = [];
  for (const source of sources) {
    const choices = phrasesBySpan.get(source.span.id) ?? [];
    const foldedSource = source.span.text.toLowerCase();
    const unique = choices.filter(p => source.span.text.indexOf(p.text) === source.span.text.lastIndexOf(p.text)).sort((a, b) => (answerUsage.get(a.text.toLowerCase()) ?? 0) - (answerUsage.get(b.text.toLowerCase()) ?? 0));
    for (const phrase of unique.slice(0, 8)) {
      const distractors = pool.filter(p => p.spanId !== source.span.id && !foldedSource.includes(p.folded) && p.folded !== phrase.text.toLowerCase());
      // Matching phrase lengths reduces answer cues; do not pad with invented options.
      distractors.sort((a, b) => Math.abs(a.text.length - phrase.text.length) - Math.abs(b.text.length - phrase.text.length));
      const selected = distractors.slice(0, 3).map(p => ({ spanId: p.spanId, text: p.text }));
      const secondary = choices.find(p => p.text !== phrase.text && !p.text.includes(phrase.text) && !phrase.text.includes(p.text));
      if (selected.length !== 3 || !secondary) continue;
      questions.push({ id: `Q${questions.length + 1}`, sourceId: source.id, documentId: source.documentId, span: source.span, answer: phrase.text, secondary: secondary.text, distractors: selected });
      answerUsage.set(phrase.text.toLowerCase(), (answerUsage.get(phrase.text.toLowerCase()) ?? 0) + 1);
      break;
    }
  }
  return { sources, questions };
}
const selectionSchema = z.object({
  summary: z.array(z.string()).min(3).max(18),
  questions: z.array(z.string()).min(1).max(50),
  map: z.array(z.string()).min(2).max(5),
  debrief: z.array(z.object({ questionId: z.string(), kind: z.enum(["EXPLAIN", "COMPARE", "APPLY"]) }).strict()).min(2).max(8),
}).strict();

/** AI chooses IDs only. Every displayed word is reconstructed from the source catalogue. */
export function compileCatalogSelection(raw: unknown, pages: SourcePage[], catalog: GroundedCatalog, count: number, selectionMethod: "AI_CURATED" | "SOURCE_ONLY" = "AI_CURATED") {
  const selected = selectionSchema.parse(raw);
  if (selected.questions.length !== count) throw new Error("GROUNDING_INVALID_COUNT");
  const sourceMap = new Map(catalog.sources.map(s => [s.id, s]));
  const questionMap = new Map(catalog.questions.map(q => [q.id, q]));
  function question(id: string) { const q = questionMap.get(id); if (!q) throw new Error("GROUNDING_UNKNOWN_SOURCE"); return q; }
  const concepts: SelectionPlan["concepts"] = [];
  const links: SelectionPlan["links"] = [];
  for (const id of selected.map) {
    const q = question(id);
    const pair = [q.answer, q.secondary].map(label => {
      let index = concepts.findIndex(c => c.label === label);
      if (index < 0) { index = concepts.length; concepts.push({ spanId: q.span.id, label }); }
      return index;
    });
    if (!links.some(l => l.from === pair[0] && l.to === pair[1])) links.push({ from: pair[0], to: pair[1], spanId: q.span.id });
  }
  return compileGroundedMaterial({
    summary: selected.summary.map(id => { const source = sourceMap.get(id); if (!source) throw new Error("GROUNDING_UNKNOWN_SOURCE"); return source.span.id; }),
    concepts, links,
    questions: selected.questions.map(id => { const q = question(id); return { spanId: q.span.id, answer: q.answer, distractors: q.distractors }; }),
    debrief: selected.debrief.map(item => { const q = question(item.questionId); return { spanId: q.span.id, focus: q.answer, kind: item.kind }; }),
  }, pages, count, selectionMethod);
}
export const catalogSelectionSchema = {
  type: "object", additionalProperties: false, required: ["summary", "questions", "map", "debrief"],
  properties: {
    summary: { type: "array", items: { type: "string" } },
    questions: { type: "array", items: { type: "string" } },
    map: { type: "array", items: { type: "string" } },
    debrief: { type: "array", items: { type: "object", additionalProperties: false, required: ["questionId", "kind"], properties: { questionId: { type: "string" }, kind: { type: "string", enum: ["EXPLAIN", "COMPARE", "APPLY"] } } } },
  },
};
