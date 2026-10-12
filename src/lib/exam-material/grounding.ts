import { createHash } from "node:crypto";
import { z } from "zod";

export type SourcePage = { id: string; documentId: string; fileName: string; pageNumber: number; text: string };
export type Span = { id: string; pageId: string; text: string; start: number; end: number; lineStart: number; lineEnd: number };
export type Citation = Span & { fileName: string; pageNumber: number; documentId: string; pageHash: string };
const string = z.string().min(2).max(180);
const planSchema = z.object({
  summary: z.array(z.string()).min(3).max(18),
  concepts: z.array(z.object({ spanId: z.string(), label: string }).strict()).min(3).max(12),
  links: z.array(z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), spanId: z.string() }).strict()).min(1).max(20),
  questions: z.array(z.object({ spanId: z.string(), answer: string, distractors: z.array(z.object({ spanId: z.string(), text: string }).strict()).length(3) }).strict()).min(1).max(50),
  debrief: z.array(z.object({ spanId: z.string(), focus: string, kind: z.enum(["EXPLAIN", "COMPARE", "APPLY"]) }).strict()).min(2).max(8),
}).strict();
export type SelectionPlan = z.infer<typeof planSchema>;
export const sha = (text: string) => createHash("sha256").update(text).digest("hex");

/** Offsets index the untouched extracted page text; lines are extracted-text lines, not PDF visual rows. */
export function sourceSpans(pages: SourcePage[]): Span[] {
  const spans: Span[] = [];
  for (const page of pages) {
    // Split on sentence boundaries/newlines, then limit large blocks without normalising source text.
    const matches = page.text.matchAll(/[^\n.!?؟]+[.!?؟]?/gu);
    for (const match of matches) {
      let start = match.index!;
      const end = start + match[0].length;
      while (start < end) {
        let stop = Math.min(end, start + 700);
        if (stop < end) { const space = page.text.lastIndexOf(" ", stop); if (space > start + 100) stop = space; }
        const raw = page.text.slice(start, stop);
        const leading = raw.length - raw.trimStart().length;
        const text = raw.trim();
        const offset = start + leading;
        if (text.length >= 25) spans.push({ id: `${page.id}:${offset}`, pageId: page.id, text,
          start: offset, end: offset + text.length,
          lineStart: page.text.slice(0, offset).split("\n").length,
          lineEnd: page.text.slice(0, offset + text.length).split("\n").length });
        start = stop;
      }
    }
  }
  // Slide PDFs often put every word or short bullet on its own extracted line.
  // Add contiguous page blocks without inventing spaces, joining pages, or changing text.
  for (const page of pages) {
    const lines = [...page.text.matchAll(/[^\n]+/gu)];
    if (lines.filter(line => line[0].trim().length > 0 && line[0].trim().length < 25).length < 2) continue;
    let start = 0;
    while (start < page.text.length) {
      let stop = Math.min(start + 650, page.text.length);
      if (stop < page.text.length) {
        const boundary = page.text.lastIndexOf("\n", stop);
        const space = page.text.lastIndexOf(" ", stop);
        if (boundary > start + 100) stop = boundary;
        else if (space > start + 100) stop = space;
      }
      const raw = page.text.slice(start, stop);
      const text = raw.trim();
      const offset = start + raw.length - raw.trimStart().length;
      const end = offset + text.length;
      if (text.length >= 25 && !spans.some(s => s.pageId === page.id && s.start === offset && s.end === end)) {
        spans.push({ id: `${page.id}:${offset}:${end}`, pageId: page.id, text, start: offset, end,
          lineStart: page.text.slice(0, offset).split("\n").length,
          lineEnd: page.text.slice(0, end).split("\n").length });
      }
      start = stop;
    }
  }
  return spans;
}
export function compileGroundedMaterial(raw: unknown, pages: SourcePage[], count: number, selectionMethod: "AI_CURATED" | "SOURCE_ONLY" = "AI_CURATED") {
  const plan = planSchema.parse(raw);
  if (plan.questions.length !== count) throw new Error("GROUNDING_INVALID_COUNT");
  const spans = new Map(sourceSpans(pages).map(s => [s.id, s]));
  const source = new Map(pages.map(p => [p.id, p]));
  function cite(id: string): Citation {
    const span = spans.get(id);
    if (!span) throw new Error("GROUNDING_UNKNOWN_SOURCE");
    const page = source.get(span.pageId)!;
    if (page.text.slice(span.start, span.end) !== span.text) throw new Error("GROUNDING_CHANGED_SOURCE");
    return { ...span, fileName: page.fileName, documentId: page.documentId, pageNumber: page.pageNumber, pageHash: sha(page.text) };
  }
  function literal(id: string, value: string) {
    const citation = cite(id);
    if (!value.trim() || value !== value.trim() || !citation.text.includes(value)) throw new Error("GROUNDING_NOT_LITERAL");
    return citation;
  }
  if (new Set(plan.summary).size !== plan.summary.length) throw new Error("GROUNDING_DUPLICATE_SUMMARY");
  const summary = plan.summary.map(cite);
  const concepts = plan.concepts.map((node, index) => ({ id: index, label: node.label, citation: literal(node.spanId, node.label) }));
  if (new Set(concepts.map(c => c.label)).size !== concepts.length) throw new Error("GROUNDING_DUPLICATE_CONCEPT");
  const links = plan.links.map(link => {
    const from = concepts[link.from]; const to = concepts[link.to];
    if (!from || !to || from.id === to.id) throw new Error("GROUNDING_INVALID_LINK");
    const citation = literal(link.spanId, from.label); literal(link.spanId, to.label);
    // Co-occurrence proves an association only; no causal/relation label is generated.
    return { from: from.id, to: to.id, citation };
  });
  const seen = new Set<string>();
  const questions = plan.questions.map((q, index) => {
    const citation = literal(q.spanId, q.answer);
    if (seen.has(q.spanId) || q.answer.length < 3 || q.answer.length > citation.text.length / 2) throw new Error("GROUNDING_INVALID_QUESTION");
    seen.add(q.spanId);
    const start = citation.text.indexOf(q.answer);
    if (citation.text.indexOf(q.answer, start + q.answer.length) !== -1) throw new Error("GROUNDING_AMBIGUOUS_ANSWER");
    const incorrect = q.distractors.map(d => ({ text: d.text, citation: literal(d.spanId, d.text) }));
    const texts = [q.answer, ...incorrect.map(d => d.text)];
    if (new Set(texts.map(t => t.trim().toLocaleLowerCase())).size !== 4 || incorrect.some(d => citation.text.includes(d.text))) throw new Error("GROUNDING_AMBIGUOUS_OPTIONS");
    const correctIndex = index % 4;
    const options = [...incorrect]; options.splice(correctIndex, 0, { text: q.answer, citation });
    return { id: `q${index + 1}`, prompt: citation.text.slice(0, start) + " […] " + citation.text.slice(start + q.answer.length), options, correctIndex, citation, concept: q.answer };
  });
  // Every selected lecture must appear in both summary and assessment; reject partial coverage.
  for (const documentId of new Set(pages.map(p => p.documentId))) {
    if (!summary.some(c => c.documentId === documentId) || !questions.some(q => q.citation.documentId === documentId)) throw new Error("GROUNDING_MISSING_LECTURE");
  }
  const instructorGuide = plan.debrief.map(d => ({ focus: d.focus, kind: d.kind, citation: literal(d.spanId, d.focus) }));
  return { content: { version: 1, selectionMethod, summary, concepts, links, questions }, instructorGuide };
}
export type Material = ReturnType<typeof compileGroundedMaterial>["content"];
export type Guide = ReturnType<typeof compileGroundedMaterial>["instructorGuide"];
export function studentMaterial(content: Material) {
  return { version: content.version, summary: content.summary, concepts: content.concepts, links: content.links,
    questions: content.questions.map(q => ({ id: q.id, prompt: q.prompt, options: q.options.map(o => o.text) })) };
}
export type StudentMaterial = ReturnType<typeof studentMaterial>;
export function gradeMaterial(content: Material, answers: Record<string, number>) {
  const ids = content.questions.map(q => q.id);
  if (Object.keys(answers).length !== ids.length || Object.keys(answers).some(id => !ids.includes(id)) || ids.some(id => !Number.isInteger(answers[id]) || answers[id] < 0 || answers[id] > 3)) throw new Error("INVALID_ANSWERS");
  const details = content.questions.map(q => ({ questionId: q.id, prompt: q.prompt, correct: answers[q.id] === q.correctIndex,
    selected: q.options[answers[q.id]].text, answer: q.options[q.correctIndex].text, concept: q.concept, citation: q.citation }));
  return { total: ids.length, correct: details.filter(d => d.correct).length, details,
    gaps: details.filter(d => !d.correct).map(d => ({ questionId: d.questionId, concept: d.concept, citation: d.citation })) };
}
export type GapReport = ReturnType<typeof gradeMaterial>;
