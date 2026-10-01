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
    globalThis.fetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      assert.equal(new URL(url).origin, "https://api.anthropic.com");
      const text = calls++ === 0 ? planText : questionText;
      return new Response(JSON.stringify({ id: "msg_test", type: "message", role: "assistant", model: "test", content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } });
    };
    return () => calls;
  }
  try {
    const calls = responses(JSON.stringify({ days }), JSON.stringify({ questions }));
    const valid = await new ClaudeAIAdapter().generate(request);
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
    console.log("Claude output validation: 4 passed, 0 failed (transport fixtures, no live API calls)");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
