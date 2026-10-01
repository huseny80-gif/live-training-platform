import type {
  ExtractionAdapter,
  ExtractionRequest,
  ExtractionResult,
  ExtractedPage,
  PdfContentType,
} from "../types";

const MODEL_ID =
  process.env.OPENAI_EXTRACTION_MODEL ||
  process.env.OPENAI_MODEL ||
  "gpt-5.6-luna";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

type ExtractedPayload = {
  pages?: Array<{
    pageNumber?: number;
    title?: string | null;
    text?: string | null;
  }>;
};

function responseText(data: OpenAIResponse): string {
  return (
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "")
      .join("") ??
    ""
  );
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("OPENAI_PDF_INVALID_JSON");
  return raw.slice(start, end + 1);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class OpenAIPdfExtractionAdapter implements ExtractionAdapter {
  readonly name = "OPENAI_PDF" as const;

  supports(_contentType: PdfContentType): boolean {
    return true;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY env var not set");

    const start = Date.now();
    const requestedPages =
      req.pageNumbers && req.pageNumbers.length > 0
        ? req.pageNumbers.slice().sort((a, b) => a - b)
        : null;

    const pageInstruction = requestedPages
      ? `Extract only these PDF pages: ${requestedPages.join(", ")}.`
      : "Extract every page in the PDF that contains readable or visually recoverable training content.";

    const maxOutputTokens = requestedPages
      ? Math.min(30000, Math.max(6000, requestedPages.length * 1600))
      : 30000;

    const prompt = `
You are a document extraction engine. Read the attached PDF directly.

${pageInstruction}

Return STRICT JSON only in this exact shape:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "page title or null",
      "text": "faithful extracted source text"
    }
  ]
}

Rules:
- Preserve the source language exactly; do not translate.
- Use OCR/vision for scanned or image-based pages when needed.
- Do not invent, explain, summarize beyond what is visibly present, or add outside knowledge.
- Keep meaningful headings, bullets, labels, definitions, and table text.
- pageNumber must be the real 1-based PDF page number.
- Include each requested page once.
- If a requested page has no recoverable content, return it with an empty text string.
- For very dense pages, preserve the important source wording while keeping each page under about 4000 characters.
- Output JSON only. No Markdown fences and no commentary.
`.trim();

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_output_tokens: maxOutputTokens,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_file",
                filename: req.fileName,
                file_data: req.fileBuffer.toString("base64"),
              },
              { type: "input_text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OPENAI_PDF_API_ERROR_${response.status}: ${body.slice(0, 500)}`
      );
    }

    const data = (await response.json()) as OpenAIResponse;
    const text = responseText(data);
    if (!text.trim()) throw new Error("OPENAI_PDF_EMPTY_RESPONSE");

    let parsed: ExtractedPayload;
    try {
      parsed = JSON.parse(extractJsonObject(text)) as ExtractedPayload;
    } catch {
      throw new Error("OPENAI_PDF_INVALID_JSON");
    }

    if (!Array.isArray(parsed.pages)) {
      throw new Error("OPENAI_PDF_PAGES_MISSING");
    }

    const requestedSet = requestedPages ? new Set(requestedPages) : null;
    const seen = new Set<number>();
    const pages: ExtractedPage[] = [];

    for (const rawPage of parsed.pages) {
      const pageNumber = Number(rawPage.pageNumber);
      if (!Number.isInteger(pageNumber) || pageNumber < 1) continue;
      if (requestedSet && !requestedSet.has(pageNumber)) continue;
      if (seen.has(pageNumber)) continue;

      seen.add(pageNumber);
      const extractedText = normalizeText(rawPage.text);
      pages.push({
        pageNumber,
        extractedText,
        title: normalizeText(rawPage.title) || undefined,
        extractionMethod: "OPENAI_PDF",
        extractionStatus:
          extractedText.length >= 20 ? "COMPLETED" : "OCR_REQUIRED",
        errorMessage:
          extractedText.length >= 20
            ? undefined
            : "No sufficient readable source text was recovered from this page.",
        processingMs: 0,
      });
    }

    if (requestedPages) {
      for (const pageNumber of requestedPages) {
        if (seen.has(pageNumber)) continue;
        pages.push({
          pageNumber,
          extractedText: "",
          extractionMethod: "OPENAI_PDF",
          extractionStatus: "OCR_REQUIRED",
          errorMessage: "Page was not returned by the extraction model.",
          processingMs: 0,
        });
      }
    }

    pages.sort((a, b) => a.pageNumber - b.pageNumber);
    const successCount = pages.filter(
      (page) => page.extractionStatus === "COMPLETED"
    ).length;

    if (successCount === 0) {
      throw new Error("OPENAI_PDF_NO_READABLE_CONTENT");
    }

    return {
      pages,
      method: "OPENAI_PDF",
      totalPages: pages.length,
      successCount,
      failureCount: pages.length - successCount,
      processingMs: Date.now() - start,
    };
  }
}
