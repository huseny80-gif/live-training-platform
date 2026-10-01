import assert from "node:assert/strict";
import { OpenAIPdfExtractionAdapter } from "../src/lib/extraction/adapters/openai-pdf";

process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_EXTRACTION_MODEL = "gpt-6-luna";

let capturedBody: Record<string, unknown> | null = null;

const originalFetch = globalThis.fetch;
globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;

  return new Response(
    JSON.stringify({
      output_text: JSON.stringify({
        pages: [
          {
            pageNumber: 1,
            title: "Test page",
            text: "This is real extracted training content for the test page.",
          },
        ],
      }),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}) as typeof fetch;

try {
  const adapter = new OpenAIPdfExtractionAdapter();
  const result = await adapter.extract({
    fileBuffer: Buffer.from("%PDF-1.7 test"),
    fileName: "course.pdf",
    mimeType: "application/pdf",
    pageNumbers: [1],
  });

  assert.equal(result.successCount, 1);

  const input = capturedBody?.input as Array<{
    content?: Array<Record<string, unknown>>;
  }>;
  const filePart = input?.[0]?.content?.find((part) => part.type === "input_file");

  assert.ok(filePart, "OpenAI request must contain an input_file item");
  assert.equal(filePart.filename, "course.pdf");
  assert.equal(filePart.detail, "low");
  assert.ok(
    String(filePart.file_data ?? "").startsWith("data:application/pdf;base64,"),
    "PDF file_data must be a data:application/pdf;base64 URL",
  );

  console.log("✓ OpenAI PDF extraction request uses a valid PDF data URL");
} finally {
  globalThis.fetch = originalFetch;
}
