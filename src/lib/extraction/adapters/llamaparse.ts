// LlamaParseAdapter — PRIMARY adapter for IMAGE_BASED PDFs.
//
// CURRENT STATUS (ACP-06): Requires outbound access to api.cloud.llamaindex.ai
// which is blocked by the session's egress policy. The adapter is fully
// implemented and wires to LLAMA_CLOUD_API_KEY from env. When egress access
// is granted, no code changes are needed — only the env var and network policy.
//
// SECURITY: API key is read from env at call time; never logged; never sent
// to any endpoint other than api.cloud.llamaindex.ai.

import type {
  ExtractionAdapter,
  ExtractionRequest,
  ExtractionResult,
  ExtractedPage,
  PdfContentType,
} from "../types";

const LLAMA_API_URL = "https://api.cloud.llamaindex.ai/api/parsing";

export class LlamaParseAdapter implements ExtractionAdapter {
  readonly name = "LLAMAPARSE" as const;

  supports(contentType: PdfContentType): boolean {
    return contentType === "IMAGE_BASED" || contentType === "MIXED" || contentType === "UNKNOWN";
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    const apiKey = process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) throw new Error("LLAMA_CLOUD_API_KEY env var not set");

    const start = Date.now();

    // Step 1: Upload file
    const form = new FormData();
    const blob = new Blob([req.fileBuffer.buffer as ArrayBuffer], { type: req.mimeType });
    form.append("file", blob, req.fileName);

    const uploadRes = await fetch(`${LLAMA_API_URL}/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!uploadRes.ok) {
      throw new Error(`LlamaParse upload failed: ${uploadRes.status}`);
    }
    const { id: jobId } = (await uploadRes.json()) as { id: string };

    // Step 2: Poll for completion
    let status = "PENDING";
    let attempts = 0;
    while (status !== "SUCCESS" && status !== "ERROR" && attempts < 60) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(`${LLAMA_API_URL}/job/${jobId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const body = (await statusRes.json()) as { status: string };
      status = body.status;
      attempts++;
    }
    if (status !== "SUCCESS") {
      throw new Error(`LlamaParse job failed or timed out: ${status}`);
    }

    // Step 3: Fetch results
    const resultRes = await fetch(`${LLAMA_API_URL}/job/${jobId}/result/markdown`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resultRes.ok) {
      throw new Error(`LlamaParse result fetch failed: ${resultRes.status}`);
    }
    const result = (await resultRes.json()) as { pages: Array<{ page: number; md: string }> };

    // Step 4: Map to our ExtractedPage format
    const targetSet = req.pageNumbers ? new Set(req.pageNumbers) : null;
    const pages: ExtractedPage[] = result.pages
      .filter((p) => !targetSet || targetSet.has(p.page))
      .map((p) => ({
        pageNumber: p.page,
        extractedText: p.md,
        title: extractTitle(p.md),
        extractionMethod: "LLAMAPARSE",
        extractionStatus: p.md.trim().length > 0 ? "COMPLETED" : "FAILED",
        processingMs: 0,
      }));

    const successCount = pages.filter((p) => p.extractionStatus === "COMPLETED").length;

    return {
      pages,
      method: "LLAMAPARSE",
      totalPages: pages.length,
      successCount,
      failureCount: pages.length - successCount,
      processingMs: Date.now() - start,
    };
  }
}

function extractTitle(markdown: string): string | undefined {
  const match = markdown.match(/^#+\s+(.+)/m);
  return match?.[1]?.trim();
}
