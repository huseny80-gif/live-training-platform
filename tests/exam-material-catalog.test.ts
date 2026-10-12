import assert from "node:assert/strict";
import { buildGroundedCatalog, compileCatalogSelection } from "../src/lib/exam-material/catalog";
import { pages } from "./fixtures/exam-material";
const source = [{ ...pages[0], text: Array.from({ length: 55 }, (_, i) => `يشرح عنصرالتدريب${i} ومهارةالتحليل${i} طريقةالتطبيق${i} في هذه المحاضرة مع أمثلةالموقع${i} لتوضيح فكرةالموضوع${i}.`).join("\n") }];
const catalog = buildGroundedCatalog(source);
assert.ok(catalog.questions.length >= 50);
for (const count of [1, 5, 10, 25, 50]) {
  const selection = { summary: catalog.sources.slice(0, 3).map(s => s.id), questions: catalog.questions.slice(0, count).map(q => q.id), map: catalog.questions.slice(0, 2).map(q => q.id), debrief: catalog.questions.slice(0, 2).map(q => ({ questionId: q.id, kind: "EXPLAIN" })) };
  const result = compileCatalogSelection(selection, source, catalog, count);
  assert.equal(result.content.questions.length, count);
  for (const question of result.content.questions) {
    for (const option of question.options) assert.equal(source[0].text.slice(option.citation.start, option.citation.end).includes(option.text), true);
    assert.equal(source[0].text.slice(question.citation.start, question.citation.end), question.citation.text);
  }
}
const base = { summary: ["S1", "S2", "S3"], questions: ["Q1"], map: ["Q1", "Q2"], debrief: [{ questionId: "Q1", kind: "EXPLAIN" }, { questionId: "Q2", kind: "APPLY" }] };
assert.throws(() => compileCatalogSelection({ ...base, questions: ["Q99999"] }, source, catalog, 1), /GROUNDING_UNKNOWN_SOURCE/);
assert.throws(() => compileCatalogSelection({ ...base, questions: ["Q1", "Q1"] }, source, catalog, 2), /GROUNDING_INVALID_QUESTION/);
assert.throws(() => compileCatalogSelection({ ...base, summary: ["S1", "S1", "S2"] }, source, catalog, 1), /GROUNDING_DUPLICATE_SUMMARY/);
assert.throws(() => compileCatalogSelection({ ...base, questions: catalog.questions.slice(0, 51).map(q => q.id) }, source, catalog, 51));
// Whitespace stays in the source; AI cannot retype or normalise the actual answer text.
const whitespace = [{ ...source[0], text: source[0].text.replaceAll(" ", "  ") }];
const spaced = buildGroundedCatalog(whitespace);
const result = compileCatalogSelection({ ...base, questions: [spaced.questions[0].id], map: spaced.questions.slice(0, 2).map(q => q.id) }, whitespace, spaced, 1);
assert.ok(result.content.questions[0].options[result.content.questions[0].correctIndex].text.includes("  "));
console.log("PASS: source-built options and references; exact counts 1/5/10/25/50; whitespace preserved; foreign/duplicate IDs rejected; 51 rejected. No provider calls.");
