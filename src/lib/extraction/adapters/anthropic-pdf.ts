import type {
  ExtractionAdapter,
  ExtractionRequest,
  ExtractionResult,
  ExtractedPage,
  PdfContentType,
} from "../types";

const MODEL_ID =
  process.env.ANTHROPIC_EXTRACTION_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  "claude-haiku-4-5-20251001";

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

type ExtractedPayload = {
  pages?: Array<{
    pageNumber?: number;
    title?: string | null;
    text?: string | null;
  }>;
};

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("ANTHROPIC_PDF_INVALID_JSON");
  return raw.slice(start, end + 1);
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export class AnthropicPdfExtractionAdapter implements ExtractionAdapter {
  readonly name = "VISION_LLM" as const;

  supports(_contentType: PdfContentType): boolean {
    return true;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY env var not set");

    const start = Date.now();
    const requestedPages =
      req.pageNumbers && req.pageNumbers.length > 0
        ? req.pageNumbers.slice().sort((a, b) => a - b)
        : null;

    const pageInstruction = requestedPages
      ? `استخرج فقط الصفحات التالية من ملف PDF: ${requestedPages.join(", ")}.`
      : "استخرج جميع الصفحات التي تحتوي محتوى تدريبيًا قابلاً للقراءة.";

    const prompt = `
أنت محرك استخراج مستندات. اقرأ ملف PDF المرفق مباشرة.
${pageInstruction}

أعد JSON فقط بالشكل التالي:
{
  "pages": [
    {
      "pageNumber": 1,
      "title": "عنوان الصفحة أو null",
      "text": "النص المستخرج بأمانة"
    }
  ]
}

قواعد إلزامية:
- حافظ على لغة المصدر كما هي ولا تترجم أثناء الاستخراج.
- استخدم قدرات الرؤية/OCR للصفحات المصورة عند الحاجة.
- لا تخترع ولا تلخص ولا تضف معرفة خارجية.
- حافظ على العناوين والنقاط والتعريفات ونصوص الجداول المهمة.
- pageNumber يجب أن يكون رقم الصفحة الحقيقي 1-based.
- أعد كل صفحة مطلوبة مرة واحدة فقط.
- إذا لم يوجد محتوى قابل للاسترجاع في صفحة مطلوبة فأعد text فارغًا.
- اجعل نص كل صفحة أقل من 4000 محرف تقريبًا.
- لا تستخدم Markdown fences ولا أي تعليق خارج JSON.
`.trim();

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_ID,
        max_tokens: 16000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: req.fileBuffer.toString("base64"),
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `ANTHROPIC_PDF_API_ERROR_${response.status}: ${body.slice(0, 500)}`
      );
    }

    const data = (await response.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("");

    if (!text.trim()) throw new Error("ANTHROPIC_PDF_EMPTY_RESPONSE");

    let parsed: ExtractedPayload;
    try {
      parsed = JSON.parse(extractJsonObject(text)) as ExtractedPayload;
    } catch {
      throw new Error("ANTHROPIC_PDF_INVALID_JSON");
    }

    if (!Array.isArray(parsed.pages)) {
      throw new Error("ANTHROPIC_PDF_PAGES_MISSING");
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
        extractionMethod: "VISION_LLM",
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
          extractionMethod: "VISION_LLM",
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
      throw new Error("ANTHROPIC_PDF_NO_READABLE_CONTENT");
    }

    return {
      pages,
      method: "VISION_LLM",
      totalPages: pages.length,
      successCount,
      failureCount: pages.length - successCount,
      processingMs: Date.now() - start,
    };
  }
}
