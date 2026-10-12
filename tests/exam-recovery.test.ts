import assert from "node:assert/strict";
import { sourceSpans } from "../src/lib/exam-material/grounding";
import { buildGroundedCatalog } from "../src/lib/exam-material/catalog";
import { selectFromSource } from "../src/lib/exam-material/source-selection";
import { generateGroundedMaterial } from "../src/lib/exam-material/ai";
async function run() {
  // Reproduce native slide text split into short labels: old sentence splitting dropped every line.
  const pages = Array.from({ length: 24 }, (_, i) => ({ id: `page-${i}`, documentId: "lecture", fileName: "GIS-Part6b.pdf", pageNumber: i + 1,
    text: [`GIS`, `Tool${i}Analysis`, `Layer${i}Selection`, `Input${i}Features`, `Output${i}Result`, `Buffer${i}Distance`, `Spatial${i}Reference`].join("\n") }));
  assert.ok(pages.every(p => p.text.split("\n").every(line => line.length < 25)));
  const spans = sourceSpans(pages);
  assert.ok(spans.length >= 24);
  for (const span of spans) {
    const page = pages.find(p => p.id === span.pageId)!;
    assert.equal(page.text.slice(span.start, span.end), span.text);
  }
  const catalog = buildGroundedCatalog(pages);
  assert.ok(catalog.questions.length >= 10);
  const result = selectFromSource(pages, catalog, 10);
  assert.equal(result.content.questions.length, 10);
  assert.equal(result.content.selectionMethod, "SOURCE_ONLY");
  assert.equal(new Set(result.content.questions.map(q => q.concept)).size, 10);
  for (const question of result.content.questions) {
    const page = pages.find(p => p.id === question.citation.pageId)!;
    assert.equal(page.text.slice(question.citation.start, question.citation.end), question.citation.text);
    for (const option of question.options) {
      const original = pages.find(p => p.id === option.citation.pageId)!;
      assert.ok(original.text.slice(option.citation.start, option.citation.end).includes(option.text));
    }
  }
  assert.throws(() => selectFromSource(pages, catalog, 50), /INSUFFICIENT_SOURCE/);
  delete process.env.ANTHROPIC_API_KEY;
  const generated = await generateGroundedMaterial(pages, 10);
  assert.equal(generated.content.questions.length, 10);
  assert.equal(generated.content.selectionMethod, "SOURCE_ONLY");
  console.log("PASS: short native slide lines recovered; 10 unique source-grounded questions produced; exact offsets/options; source-only mode honest; impossible 50 not padded. No network calls.");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
