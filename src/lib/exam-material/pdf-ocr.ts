import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createCanvas, DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";
import { createWorker, OEM } from "tesseract.js";
import { sha, type SourcePage } from "./grounding";

export async function extractPdfOcr(buffer: Buffer, pages: SourcePage[]) {
  if (pages.length > 40) throw new Error("OCR_PAGE_LIMIT");
  if (!globalThis.DOMMatrix) Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  const eng = await readFile(join(dirname(require.resolve("@tesseract.js-data/eng")), "4.0.0_best_int", "eng.traineddata.gz"));
  const ara = await readFile(join(dirname(require.resolve("@tesseract.js-data/ara")), "4.0.0_best_int", "ara.traineddata.gz"));
  const languageDir = await mkdtemp(join(tmpdir(), "training-ocr-"));
  await writeFile(join(languageDir, "eng.traineddata.gz"), eng);
  await writeFile(join(languageDir, "ara.traineddata.gz"), ara);
  const worker = await createWorker(["eng", "ara"], OEM.LSTM_ONLY, { langPath: languageDir, cacheMethod: "none", cachePath: languageDir });
  const output: SourcePage[] = [];
  try {
    for (const source of pages) {
      const page = await pdf.getPage(source.pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext("2d");
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: context as unknown as CanvasRenderingContext2D, viewport }).promise;
      const { data } = await worker.recognize(canvas.toBuffer("image/png"), {}, { text: true, blocks: true });
      const confidences = new Map<string, number>();
      const confidenceKey = (text: string) => text.replace(/\p{Cf}/gu, "").trim();
      for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) for (const word of line.words) {
        const text = confidenceKey(word.text);
        if (text) confidences.set(text, Math.min(word.confidence, confidences.get(text) ?? 100));
      }
      const uncertainRanges = [...data.text.matchAll(/\S+/gu)].filter(token => confidenceKey(token[0]) && (confidences.get(confidenceKey(token[0])) ?? 0) < 80).map(token => ({ start: token.index!, end: token.index! + token[0].length }));
      // Keep recognised source text as-is; do not ask a language model to fill unreadable regions.
      output.push(data.confidence >= 40 && data.text.trim().length >= 25
        ? { ...source, text: data.text, extractionMethod: "TESSERACT_OCR", documentHash: sha(buffer), ocrQuality: { version: 1, uncertainRanges } }
        : { ...source, extractionMethod: source.extractionMethod ?? "NATIVE_TEXT", documentHash: sha(buffer) });
      page.cleanup();
      canvas.width = 1; canvas.height = 1;
    }
    return output;
  } finally { await worker.terminate(); await pdf.destroy(); await rm(languageDir, { recursive: true, force: true }); }
}
