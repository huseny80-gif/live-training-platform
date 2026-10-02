import assert from "node:assert/strict";
import { ClaudeAIAdapter } from "../src/lib/ai/adapters/claude";

async function run() {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "test-only-no-network";
  const days = Array.from({ length: 10 }, (_, i) => ({ dayNumber: i + 1, title: `اليوم ${i + 1}`, objectives: ["فهم الإحداثيات"], topics: ["التحليل المكاني"], contentSummary: "تحليل البيانات الجغرافية", pageRangeStart: 1, pageRangeEnd: 1, sourcePages: [1] }));
  const questions = Array.from({ length: 5 }, (_, i) => ({ questionText: `ما طريقة التحليل ${i + 1}؟`, questionOrder: i + 1, options: ["A", "B", "C", "D"].map((label, j) => ({ label, text: `اختيار التحليل ${j + 1}` })), correctLabel: "A", explanation: "الموقع يرتبط بإحداثياته.", sourcePageNumber: 1 }));
  const request = { pages: [{ pageId: "test-page", pageNumber: 1, extractedText: "المعلومات الجغرافية تعتمد على الإحداثيات والتحليل المكاني وتساعد على تحديد المواقع." }], language: "AR" as const, programTitle: "اختبار محلي", totalDays: 10, questionsPerDay: 5 };
  function responses(planText: string, questionText: string) {
    let calls = 0;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      assert.equal(new URL(url).origin, "https://api.anthropic.com");
      calls++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.output_config.format.type, "json_schema");
      const text = body.output_config.format.schema.properties.days ? planText : questionText;
      return new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "test", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    return () => calls;
  }
  try {
    const calls = responses(JSON.stringify({ days }), JSON.stringify({ questions }));
    const progress: number[] = [];
    const valid = await new ClaudeAIAdapter().generate({ ...request, onProgress: async days => { progress.push(days); } });
    assert.deepEqual(progress, [2, 4, 6, 8, 10]);
    assert.equal(valid.questions.length, 50); assert.equal(valid.days.length, 10); assert.equal(calls(), 11);
    console.log("PASS: valid provider JSON retains 10 days and 50 complete questions");
    responses("invalid JSON", JSON.stringify({ questions }));
    await assert.rejects(new ClaudeAIAdapter().generate(request), /AI_INVALID_CONTENT/);
    console.log("PASS: invalid day plans fail instead of fabricating fallback days");
    const missing = structuredClone(questions); missing[0].options.pop();
    responses(JSON.stringify({ days }), JSON.stringify({ questions: missing }));
    await assert.rejects(new ClaudeAIAdapter().generate(request), /AI_INVALID_CONTENT/);
    console.log("PASS: missing options fail instead of fabricating answer choices");
    const wrong = structuredClone(questions); wrong[0].correctLabel = "X";
    responses(JSON.stringify({ days }), JSON.stringify({ questions: wrong }));
    await assert.rejects(new ClaudeAIAdapter().generate(request), /AI_INVALID_CONTENT/);
    console.log("PASS: invalid correct labels cannot silently become A");
    const incomplete = structuredClone(questions).slice(0, 4);
    let repaired = false;
    const baseResponses = responses(JSON.stringify({ days }), JSON.stringify({ questions }));
    const validFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.output_config.format.schema.properties.questions && !repaired) {
        repaired = true;
        const response = await validFetch(input, init);
        const data = await response.json();
        data.content[0].text = JSON.stringify({ questions: incomplete });
        return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      }
      return validFetch(input, init);
    };
    const corrected = await new ClaudeAIAdapter().generate(request);
    assert.equal(corrected.questions.length, 50);
    assert.equal(baseResponses(), 12);
    console.log("PASS: incomplete question output is corrected once before returning all 50 questions");
    const invalidSources = structuredClone(questions); invalidSources[0].sourcePageNumber = 999;
    responses(JSON.stringify({ days }), JSON.stringify({ questions: invalidSources }));
    await assert.rejects(new ClaudeAIAdapter().generate(request), /AI_INVALID_SOURCE_PAGE/);
    console.log("PASS: invalid source pages remain rejected after bounded correction");
    const repeatedOrder = structuredClone(questions); repeatedOrder.forEach(q => { q.questionOrder = 1; });
    responses(JSON.stringify({ days }), JSON.stringify({ questions: repeatedOrder }));
    const ordered = await new ClaudeAIAdapter().generate(request);
    assert.deepEqual(ordered.questions.slice(0, 5).map(q => q.questionOrder), [1, 2, 3, 4, 5]);
    console.log("PASS: question order is assigned from the validated array without changing answers");
    const allPages = Array.from({ length: 147 }, (_, i) => ({ pageId: `page-${i + 1}`, pageNumber: i + 1, extractedText: "محتوى الصفحة ".repeat(100) + `نهاية الصفحة الكاملة ${i + 1}` }));
    const coverage = { mcq: new Set<number>(), tf: new Set<number>() }; let finalCall = 0;
    globalThis.fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)); const schema = body.output_config.format.schema; const prompt = body.messages[0].content;
      let content: unknown;
      if (schema.properties.days) content = { days: Array.from({ length: 7 }, (_, i) => ({ ...days[0], dayNumber: i + 1, sourcePages: [1] })) };
      else {
        const tf = schema.properties.questions.items.properties.options.items.properties.label.enum.length === 2;
        const pageNumbers = [...prompt.matchAll(/\[صفحة (\d+)/g)].map(m => Number(m[1]));
        pageNumbers.forEach(n => { coverage[tf ? "tf" : "mcq"].add(n); assert.ok(prompt.includes(`نهاية الصفحة الكاملة ${n}`)); });
        content = { questions: questions.map((q, i) => ({ ...q, questionText: `عبارة الاختبار النهائي ${finalCall}-${i} صحيحة؟`, sourcePageNumber: pageNumbers[0], options: tf ? [{ label: "A", text: "صح" }, { label: "B", text: "خطأ" }] : q.options })) }; finalCall++;
      }
      return new Response(JSON.stringify({ id: "msg_final", type: "message", role: "assistant", model: "test", content: [{ type: "text", text: JSON.stringify(content) }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const final = await new ClaudeAIAdapter().generate({ ...request, pages: allPages, totalDays: 7, assessmentType: "FINAL", questionTypesByDay: { 1: "MULTIPLE_CHOICE", 2: "MULTIPLE_CHOICE", 3: "MULTIPLE_CHOICE", 4: "TRUE_FALSE", 5: "TRUE_FALSE", 6: "TRUE_FALSE", 7: "TRUE_FALSE" } });
    assert.equal(final.questions.filter(q => q.questionType === "MULTIPLE_CHOICE").length, 15);
    assert.equal(final.questions.filter(q => q.questionType === "TRUE_FALSE").length, 20);
    assert.ok(final.questions.filter(q => q.questionType === "TRUE_FALSE").every(q => q.options.length === 2 && q.options[0].text === "صح" && q.options[1].text === "خطأ"));
    assert.equal(coverage.mcq.size, 147); assert.equal(coverage.tf.size, 147);
    console.log("PASS: final generation produces 15 MCQ and 20 true/false while each type reads all 147 complete source pages");
    console.log("Claude output validation: 8 passed, 0 failed (transport fixtures, no live API calls)");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
