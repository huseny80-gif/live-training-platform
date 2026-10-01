import { inflateSync } from "node:zlib";
import type {
  ExtractionAdapter,
  ExtractionRequest,
  ExtractionResult,
  ExtractedPage,
  PdfContentType,
} from "../types";

type PdfObject = {
  id: number;
  body: string;
};

type Token =
  | { type: "name"; value: string }
  | { type: "number"; value: number }
  | { type: "word"; value: string }
  | { type: "string"; value: Buffer }
  | { type: "hex"; value: Buffer }
  | { type: "array"; value: Token[] };

type FontDecoder = {
  map: Map<string, string>;
  byteLengths: number[];
};

function parseObjects(buffer: Buffer): Map<number, PdfObject> {
  const binary = buffer.toString("latin1");
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  const found: Array<{ id: number; start: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = re.exec(binary))) {
    found.push({ id: Number(match[1]), start: re.lastIndex });
  }

  const objects = new Map<number, PdfObject>();

  for (let index = 0; index < found.length; index++) {
    const current = found[index];
    const searchEnd = index + 1 < found.length ? found[index + 1].start : binary.length;
    const endObj = binary.indexOf("endobj", current.start);
    const end = endObj >= 0 && endObj < searchEnd ? endObj : searchEnd;
    objects.set(current.id, {
      id: current.id,
      body: binary.slice(current.start, end),
    });
  }

  return objects;
}

function decodeAsciiHex(input: Buffer): Buffer {
  const text = input.toString("latin1").replace(/\s+/g, "").replace(/>[\s\S]*$/, "");
  const padded = text.length % 2 === 0 ? text : text + "0";
  return Buffer.from(padded, "hex");
}

function extractStream(body: string): Buffer | null {
  const streamIndex = body.indexOf("stream");
  if (streamIndex < 0) return null;

  let start = streamIndex + "stream".length;
  if (body[start] === "\r" && body[start + 1] === "\n") start += 2;
  else if (body[start] === "\n" || body[start] === "\r") start += 1;

  const end = body.indexOf("endstream", start);
  if (end < 0) return null;

  let bytes: Buffer<ArrayBufferLike> = Buffer.from(body.slice(start, end), "latin1");

  try {
    if (/\/Filter\s*\/FlateDecode\b/.test(body) || /\/Filter\s*\[\s*\/FlateDecode/.test(body)) {
      bytes = inflateSync(bytes);
    } else if (/\/Filter\s*\/ASCIIHexDecode\b/.test(body)) {
      bytes = decodeAsciiHex(bytes);
    } else if (/\/Filter\s*\//.test(body)) {
      // Unsupported filter. Return null so another provider can handle it.
      return null;
    }
  } catch {
    return null;
  }

  return bytes;
}

function parseRef(text: string, key: string): number | null {
  const match = text.match(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  return match ? Number(match[1]) : null;
}

function parseRefs(text: string): number[] {
  const refs: number[] = [];
  const re = /(\d+)\s+\d+\s+R/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) refs.push(Number(match[1]));
  return refs;
}

function orderedPageIds(objects: Map<number, PdfObject>): number[] {
  const catalog = [...objects.values()].find((obj) => /\/Type\s*\/Catalog\b/.test(obj.body));
  const pagesRoot = catalog ? parseRef(catalog.body, "Pages") : null;
  const ordered: number[] = [];
  const visited = new Set<number>();

  function visit(id: number) {
    if (visited.has(id)) return;
    visited.add(id);

    const obj = objects.get(id);
    if (!obj) return;

    if (/\/Type\s*\/Page\b/.test(obj.body) && !/\/Type\s*\/Pages\b/.test(obj.body)) {
      ordered.push(id);
      return;
    }

    const kids = obj.body.match(/\/Kids\s*\[([\s\S]*?)\]/)?.[1];
    if (kids) {
      for (const child of parseRefs(kids)) visit(child);
    }
  }

  if (pagesRoot) visit(pagesRoot);

  if (ordered.length === 0) {
    return [...objects.values()]
      .filter((obj) => /\/Type\s*\/Page\b/.test(obj.body) && !/\/Type\s*\/Pages\b/.test(obj.body))
      .map((obj) => obj.id)
      .sort((a, b) => a - b);
  }

  return ordered;
}

function resolveResourcesBody(
  pageId: number,
  objects: Map<number, PdfObject>
): string {
  let currentId: number | null = pageId;
  const seen = new Set<number>();

  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const obj = objects.get(currentId);
    if (!obj) break;

    const resourcesRef = parseRef(obj.body, "Resources");
    if (resourcesRef) return objects.get(resourcesRef)?.body ?? "";

    const inline = obj.body.match(/\/Resources\s*<<([\s\S]*?)>>/)?.[1];
    if (inline) return inline;

    currentId = parseRef(obj.body, "Parent");
  }

  return "";
}

function unicodeFromHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "");
  if (!clean) return "";

  const bytes = Buffer.from(clean.length % 2 === 0 ? clean : "0" + clean, "hex");

  if (bytes.length >= 2) {
    let output = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const code = bytes.readUInt16BE(i);
      if (code === 0) continue;
      output += String.fromCharCode(code);
    }
    if (output) return output;
  }

  return bytes.toString("latin1");
}

function parseToUnicodeCMap(body: string): FontDecoder | null {
  const stream = extractStream(body);
  if (!stream) return null;
  const text = stream.toString("latin1");

  const map = new Map<string, string>();

  const bfcharBlocks = text.match(/beginbfchar([\s\S]*?)endbfchar/g) ?? [];
  for (const block of bfcharBlocks) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(block))) {
      map.set(match[1].toUpperCase(), unicodeFromHex(match[2]));
    }
  }

  const bfrangeBlocks = text.match(/beginbfrange([\s\S]*?)endbfrange/g) ?? [];
  for (const block of bfrangeBlocks) {
    const arrayRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([\s\S]*?)\]/g;
    let arrayMatch: RegExpExecArray | null;
    while ((arrayMatch = arrayRe.exec(block))) {
      const start = parseInt(arrayMatch[1], 16);
      const end = parseInt(arrayMatch[2], 16);
      const width = arrayMatch[1].length;
      const values = [...arrayMatch[3].matchAll(/<([0-9A-Fa-f]+)>/g)].map((m) => m[1]);
      for (let code = start; code <= end; code++) {
        const value = values[code - start];
        if (!value) break;
        map.set(code.toString(16).toUpperCase().padStart(width, "0"), unicodeFromHex(value));
      }
    }

    const sequentialRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;
    let seq: RegExpExecArray | null;
    while ((seq = sequentialRe.exec(block))) {
      const start = parseInt(seq[1], 16);
      const end = parseInt(seq[2], 16);
      const dst = parseInt(seq[3], 16);
      const srcWidth = seq[1].length;
      const dstWidth = seq[3].length;

      for (let code = start; code <= end; code++) {
        const srcHex = code.toString(16).toUpperCase().padStart(srcWidth, "0");
        const dstHex = (dst + code - start).toString(16).toUpperCase().padStart(dstWidth, "0");
        map.set(srcHex, unicodeFromHex(dstHex));
      }
    }
  }

  if (map.size === 0) return null;

  const byteLengths = [...new Set([...map.keys()].map((key) => key.length / 2))]
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => b - a);

  return { map, byteLengths };
}

function pageFontDecoders(
  pageId: number,
  objects: Map<number, PdfObject>
): Map<string, FontDecoder> {
  const resources = resolveResourcesBody(pageId, objects);
  const fontDict = resources.match(/\/Font\s*<<([\s\S]*?)>>/)?.[1] ?? resources;
  const aliases = new Map<string, number>();

  const refRe = /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g;
  let match: RegExpExecArray | null;
  while ((match = refRe.exec(fontDict))) {
    aliases.set(match[1], Number(match[2]));
  }

  const decoders = new Map<string, FontDecoder>();

  for (const [alias, fontId] of aliases) {
    const font = objects.get(fontId);
    if (!font) continue;
    const toUnicodeRef = parseRef(font.body, "ToUnicode");
    if (!toUnicodeRef) continue;
    const cmapObj = objects.get(toUnicodeRef);
    if (!cmapObj) continue;
    const decoder = parseToUnicodeCMap(cmapObj.body);
    if (decoder) decoders.set(alias, decoder);
  }

  return decoders;
}

function parseLiteralString(source: string, start: number): { bytes: Buffer; end: number } {
  const output: number[] = [];
  let depth = 1;
  let i = start + 1;

  while (i < source.length && depth > 0) {
    const ch = source[i];

    if (ch === "\\") {
      const next = source[i + 1] ?? "";
      if (next === "\n") output.push(0x0a);
      else if (next === "\r") output.push(0x0d);
      else if (next === "\t") output.push(0x09);
      else if (next === "\b") output.push(0x08);
      else if (next === "\f") output.push(0x0c);
      else if (next === "\r" && source[i + 2] === "\n") {
        i += 1;
      } else if (next === "\n" || next === "\r") {
        // line continuation: append nothing
      } else if (/[0-7]/.test(next)) {
        let octal = next;
        let j = i + 2;
        while (j < source.length && octal.length < 3 && /[0-7]/.test(source[j])) {
          octal += source[j++];
        }
        output.push(parseInt(octal, 8) & 0xff);
        i = j - 1;
      } else {
        output.push(next.charCodeAt(0) & 0xff);
      }
      i += 2;
      continue;
    }

    if (ch === "(") {
      depth++;
      output.push(ch.charCodeAt(0));
      i++;
      continue;
    }

    if (ch === ")") {
      depth--;
      if (depth > 0) output.push(ch.charCodeAt(0));
      i++;
      continue;
    }

    output.push(ch.charCodeAt(0) & 0xff);
    i++;
  }

  return { bytes: Buffer.from(output), end: i };
}

function parseHexString(source: string, start: number): { bytes: Buffer; end: number } {
  const close = source.indexOf(">", start + 1);
  const end = close >= 0 ? close : source.length - 1;
  const hex = source.slice(start + 1, end).replace(/\s+/g, "");
  const padded = hex.length % 2 === 0 ? hex : hex + "0";
  return { bytes: Buffer.from(padded, "hex"), end: end + 1 };
}

function tokenizeContent(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  function skipSpace() {
    while (i < source.length) {
      if (/\s/.test(source[i])) {
        i++;
        continue;
      }
      if (source[i] === "%") {
        while (i < source.length && source[i] !== "\n" && source[i] !== "\r") i++;
        continue;
      }
      break;
    }
  }

  function readToken(): Token | null {
    skipSpace();
    if (i >= source.length) return null;

    const ch = source[i];

    if (ch === "/") {
      i++;
      const start = i;
      while (i < source.length && !/[\s\[\]()<>/%]/.test(source[i])) i++;
      return { type: "name", value: source.slice(start, i) };
    }

    if (ch === "(") {
      const parsed = parseLiteralString(source, i);
      i = parsed.end;
      return { type: "string", value: parsed.bytes };
    }

    if (ch === "<" && source[i + 1] !== "<") {
      const parsed = parseHexString(source, i);
      i = parsed.end;
      return { type: "hex", value: parsed.bytes };
    }

    if (ch === "[") {
      i++;
      const values: Token[] = [];
      while (i < source.length) {
        skipSpace();
        if (source[i] === "]") {
          i++;
          break;
        }
        const token = readToken();
        if (!token) break;
        values.push(token);
      }
      return { type: "array", value: values };
    }

    const start = i;
    while (i < source.length && !/\s/.test(source[i]) && !/[\[\]()<>/%]/.test(source[i])) i++;
    if (i === start) {
      i++;
      return null;
    }

    const raw = source.slice(start, i);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw)) {
      return { type: "number", value: Number(raw) };
    }
    return { type: "word", value: raw };
  }

  while (i < source.length) {
    const token = readToken();
    if (token) tokens.push(token);
  }

  return tokens;
}

function decodeBytes(bytes: Buffer, decoder?: FontDecoder): string {
  if (bytes.length === 0) return "";

  if (decoder && decoder.map.size > 0) {
    let output = "";
    let offset = 0;

    while (offset < bytes.length) {
      let matched = false;
      for (const length of decoder.byteLengths) {
        if (offset + length > bytes.length) continue;
        const key = bytes.subarray(offset, offset + length).toString("hex").toUpperCase();
        const value = decoder.map.get(key);
        if (value !== undefined) {
          output += value;
          offset += length;
          matched = true;
          break;
        }
      }
      if (!matched) {
        const code = bytes[offset];
        if (code >= 32 || code === 9) output += String.fromCharCode(code);
        offset++;
      }
    }

    return output;
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    let output = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) {
      output += String.fromCharCode(bytes.readUInt16BE(i));
    }
    return output;
  }

  return bytes.toString("latin1");
}

function textFromContent(
  content: Buffer,
  fonts: Map<string, FontDecoder>
): string {
  const tokens = tokenizeContent(content.toString("latin1"));
  const chunks: string[] = [];
  let currentFont: FontDecoder | undefined;

  function emit(value: string, newline = false) {
    const cleaned = value
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
      .replace(/[ \t]+/g, " ")
      .trim();
    if (cleaned) chunks.push(cleaned);
    if (newline && chunks[chunks.length - 1] !== "\n") chunks.push("\n");
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "word") continue;

    if (token.value === "Tf") {
      const fontToken = tokens[index - 2];
      if (fontToken?.type === "name") {
        currentFont = fonts.get(fontToken.value);
      }
      continue;
    }

    if (token.value === "Tj" || token.value === "'" || token.value === "\"") {
      const prev = tokens[index - 1];
      if (prev?.type === "string" || prev?.type === "hex") {
        emit(decodeBytes(prev.value, currentFont), token.value !== "Tj");
      }
      continue;
    }

    if (token.value === "TJ") {
      const prev = tokens[index - 1];
      if (prev?.type === "array") {
        let line = "";
        for (const part of prev.value) {
          if (part.type === "string" || part.type === "hex") {
            line += decodeBytes(part.value, currentFont);
          } else if (part.type === "number" && part.value < -120) {
            line += " ";
          }
        }
        emit(line);
      }
      continue;
    }

    if (token.value === "T*" || token.value === "Td" || token.value === "TD" || token.value === "Tm") {
      if (chunks[chunks.length - 1] !== "\n") chunks.push("\n");
    }
  }

  return chunks
    .join(" ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageContentRefs(pageBody: string): number[] {
  const array = pageBody.match(/\/Contents\s*\[([\s\S]*?)\]/)?.[1];
  if (array) return parseRefs(array);

  const single = parseRef(pageBody, "Contents");
  return single ? [single] : [];
}

export class NativeTextExtractionAdapter implements ExtractionAdapter {
  readonly name = "NATIVE_TEXT" as const;

  supports(_contentType: PdfContentType): boolean {
    // Always attempt native text extraction first.
    // PDF structural inspection can classify slide-heavy / PowerPoint-exported
    // documents as IMAGE_BASED even when they still contain embedded text in
    // compressed content streams. The native extractor is cheap and fails
    // closed with NATIVE_TEXT_NO_READABLE_CONTENT when no usable text exists,
    // allowing the pipeline to fall back safely to OCR/AI providers.
    return true;
  }

  async extract(req: ExtractionRequest): Promise<ExtractionResult> {
    const started = Date.now();
    const objects = parseObjects(req.fileBuffer);
    const pageIds = orderedPageIds(objects);

    if (pageIds.length === 0) {
      throw new Error("NATIVE_TEXT_NO_PAGES");
    }

    const requested = req.pageNumbers?.length
      ? new Set(req.pageNumbers)
      : null;

    const pages: ExtractedPage[] = [];

    for (let pageIndex = 0; pageIndex < pageIds.length; pageIndex++) {
      const pageNumber = pageIndex + 1;
      if (requested && !requested.has(pageNumber)) continue;

      const page = objects.get(pageIds[pageIndex]);
      if (!page) continue;

      const fonts = pageFontDecoders(page.id, objects);
      const contentRefs = pageContentRefs(page.body);
      const pageParts: string[] = [];

      for (const ref of contentRefs) {
        const streamObj = objects.get(ref);
        if (!streamObj) continue;
        const stream = extractStream(streamObj.body);
        if (!stream) continue;
        const extracted = textFromContent(stream, fonts);
        if (extracted) pageParts.push(extracted);
      }

      const extractedText = pageParts
        .join("\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      const firstLine = extractedText
        .split(/\n/)
        .map((line) => line.trim())
        .find((line) => line.length >= 3);

      pages.push({
        pageNumber,
        extractedText,
        title: firstLine?.slice(0, 180),
        extractionMethod: "NATIVE_TEXT",
        extractionStatus: extractedText.length >= 20 ? "COMPLETED" : "OCR_REQUIRED",
        confidenceScore: extractedText.length >= 80 ? 0.95 : extractedText.length >= 20 ? 0.75 : 0.2,
        errorMessage:
          extractedText.length >= 20
            ? undefined
            : "No sufficient native text was recovered from this page.",
        processingMs: 0,
      });
    }

    const successCount = pages.filter((page) => page.extractionStatus === "COMPLETED").length;

    if (successCount === 0) {
      throw new Error("NATIVE_TEXT_NO_READABLE_CONTENT");
    }

    return {
      pages,
      method: "NATIVE_TEXT",
      totalPages: pages.length,
      successCount,
      failureCount: pages.length - successCount,
      processingMs: Date.now() - started,
    };
  }
}
